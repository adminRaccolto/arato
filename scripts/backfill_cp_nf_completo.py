#!/usr/bin/env python3
# Backfill completo de CP para NFs processadas que ficaram sem Conta a Pagar correta
# (3 categorias achadas na auditoria de 09/10/2026 — ver memoria
# project_cp_nf_sem_financeiro_pendentes.md): sem lancamento_id nenhum, lancamento_id
# apontando pra lancamento apagado, ou lancamento_id "roubado" por outra NF do mesmo
# pedido (bug corrigido no commit 5e67dafd). Cria UM lancamento novo e independente por
# NF, sempre -- nunca reaproveita nada -- e religa nf_entradas.lancamento_id pro id novo
# (corrige tambem o ponteiro fantasma das categorias 2 e 3). Nao toca estoque, nao toca
# o lancamento de quem ja era dono legitimo (cat3: a outra NF do pedido fica como estava).
#
# Uso: python3 backfill_cp_nf_completo.py [--aplicar]
import os, json, ssl, urllib.request, urllib.error, datetime

ssl._create_default_https_context = ssl._create_unverified_context
U = os.environ["NEXT_PUBLIC_SUPABASE_URL"] + "/rest/v1/"
K = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

def req(m, t, q="", body=None, prefer=None):
    h = {"apikey": K, "Authorization": "Bearer " + K, "Content-Type": "application/json"}
    if prefer: h["Prefer"] = prefer
    r = urllib.request.Request(U + t + ("?" + q if q else ""),
                                data=json.dumps(body).encode() if body is not None else None,
                                headers=h, method=m)
    try:
        b = urllib.request.urlopen(r).read()
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"{m} {t}: {e.read().decode()}")
    return json.loads(b) if b else None

CAT = {
    "vef": "Insumos — Sementes", "custo_direto": "Serviços Agrícolas",
    "combustivel": "Combustível", "pecas": "Peças / Manutenção",
    "insumos": "Insumos — Fertilizantes",
}

targets = json.load(open("/tmp/backfill_cp_targets.json"))
todas = [(n, "cat1") for n in targets["cat1"]] + \
        [(n, "cat2") for n in targets["cat2"]] + \
        [(n, "cat3") for n in targets["cat3"]]

aplicar = "--aplicar" in __import__("sys").argv
print(f"Total a processar: {len(todas)}  (modo: {'APLICAR' if aplicar else 'DRY-RUN'})")

snap = []
criados = []
erros = []
total_valor = 0.0

for n, cat in todas:
    dt = n["data_entrada"] or n["data_emissao"]
    row = {
        "fazenda_id": n["fazenda_id"], "tipo": "pagar", "moeda": "BRL",
        "descricao": f'NF {n["numero"]} — {n["emitente_nome"]}',
        "categoria": CAT.get(n.get("tipo_entrada"), "Outros"),
        "data_lancamento": dt,
        "data_vencimento": n["data_vencimento_cp"] or dt,
        "status": "em_aberto", "auto": True,
        "valor": n["valor_total"], "pessoa_id": n["pessoa_id"],
        "nfe_numero": n["numero"], "numero_documento": n["numero"],
        "tipo_documento_lcdpr": "NF", "nf_entrada_id": n["id"],
        "origem_lancamento": "nf_entrada", "produtor_id": n["produtor_id"],
        "ano_safra_id": n["ano_safra_id"], "ciclo_id": n["ciclo_id"],
        "operacao_gerencial_id": n["operacao_gerencial_id"],
        "centro_custo_id": n["centro_custo_id"], "forma_pagamento": n["forma_pagamento"],
        "vinculo_atividade": n["vinculo_atividade"], "entidade_contabil": n["entidade_contabil"],
    }
    row = {k: v for k, v in row.items() if v is not None}
    total_valor += n["valor_total"] or 0
    print(("CRIA " if aplicar else "DRY  "), cat, n["numero"], (n["emitente_nome"] or "")[:28],
          n["valor_total"], row["data_vencimento"], row["categoria"])
    if aplicar:
        try:
            c = req("POST", "lancamentos", "", row, "return=representation")[0]
            req("PATCH", "nf_entradas", "id=eq.%s" % n["id"],
                {"lancamento_id": c["id"]})
            snap.append({"nf_id": n["id"], "numero": n["numero"], "categoria": cat,
                         "lancamento_id_antes": n.get("lancamento_id"),
                         "lancamento_id_criado": c["id"]})
            criados.append(c["id"])
        except Exception as e:
            erros.append({"nf_id": n["id"], "numero": n["numero"], "erro": str(e)})

print(f"\nTotal: {len(todas)} NFs, R$ {total_valor:,.2f}")
if aplicar:
    print(f"Criados: {len(criados)}  Erros: {len(erros)}")
    f = "backup/backfill_cp_nf_completo_%s.json" % datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    json.dump({"snapshot": snap, "lancamentos_criados": criados, "erros": erros}, open(f, "w"), indent=1)
    print("rollback em", f)
    if erros:
        print("ERROS:")
        for e in erros: print(" ", e)
