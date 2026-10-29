// Máquina cadastrada a partir do item da NF de compra (tipo de entrada "Máquinas e Equipamentos (Imobilizado)").
import type { Maquina } from "../supabase";

/** Tipo da máquina pela descrição do item da NF (o usuário ajusta depois no cadastro). */
export function tipoMaquinaDaDescricao(desc: string): Maquina["tipo"] {
  const d = (desc ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
  if (/COLHEITADEIRA|COLHEDORA|COMBINADA/.test(d)) return "colheitadeira";
  if (/PULVERIZADOR|AUTOPROPELIDO|UNIPORT|DEFENDER/.test(d)) return "pulverizador";
  if (/PLANTADEIRA|SEMEADORA|PLANTADORA/.test(d)) return "plantadeira";
  if (/TRATOR|TRACTOR/.test(d)) return "trator";
  if (/CAMINHAO|CAVALO MECANICO|TRUCK/.test(d)) return "caminhao";
  if (/CARRETA|REBOQUE|SEMIRREBOQUE|SEMI-REBOQUE|GRANELEIRO|BITREM|RODOTREM|BASCULANTE/.test(d)) return "carreta";
  if (/CAMINHONETE|PICKUP|PICK-UP|AUTOMOVEL|HILUX|S10|RANGER|AMAROK|TORO|STRADA/.test(d)) return "carro";
  if (/GRADE|PLATAFORMA|DISTRIBUIDOR|ESPALHADOR|SUBSOLADOR|ESCARIFICADOR|ROCADEIRA|IMPLEMENTO|PLAINA|ARADO|ENLEIRADOR|CARRETA AGRICOLA/.test(d)) return "implemento";
  return "outro";
}

/** Dados de aquisição a gravar numa máquina já cadastrada: só preenche o que está vazio. */
export function aquisicaoParaAtualizar(m: Pick<Maquina, "nr_nf_aquisicao" | "data_aquisicao" | "valor_aquisicao">, nf: { numero: string; data: string; valor: number }): Partial<Maquina> {
  const patch: Partial<Maquina> = {};
  if (!m.nr_nf_aquisicao && nf.numero) patch.nr_nf_aquisicao = nf.numero;
  if (!m.data_aquisicao && nf.data) patch.data_aquisicao = nf.data;
  if (!(Number(m.valor_aquisicao) > 0) && nf.valor > 0) patch.valor_aquisicao = nf.valor;
  return patch;
}
