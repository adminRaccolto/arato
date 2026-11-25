import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { EditorNfe, SecaoNfe } from "../../components/fiscal/EditorNfe";
import { OperationalPresentation } from "../../components/arato-layout/presentation-mode";
import { ABAS_EMISSAO_NFE, moverAbaEmissao } from "./editor-nfe";

const props = { titulo: "NF-e Avulsa", aba: "emitente" as const, onAba: () => {}, onFechar: () => {}, total: "R$ 300,00" };
const conteudo = <SecaoNfe titulo="Dados da operação"><input name="referencia" defaultValue="Origem preservada" /></SecaoNfe>;

test("navegação percorre as mesmas seis etapas sem ultrapassar as extremidades", () => {
  assert.deepEqual(ABAS_EMISSAO_NFE.map(a => a.label), ["Emitente", "Destinatário", "Itens e tributos", "Transporte", "Referências e observações", "Origem da operação"]);
  let atual: (typeof ABAS_EMISSAO_NFE)[number]["id"] = ABAS_EMISSAO_NFE[0].id;
  const visitadas: string[] = [atual];
  for (let i = 1; i < ABAS_EMISSAO_NFE.length; i++) { atual = moverAbaEmissao(atual, 1); visitadas.push(atual); }
  assert.deepEqual(visitadas, ABAS_EMISSAO_NFE.map(a => a.id));
  assert.equal(moverAbaEmissao("origem", 1), "origem");
  assert.equal(moverAbaEmissao("emitente", -1), "emitente");
  assert.equal(moverAbaEmissao("origem", 1, true), "emitente");
  assert.equal(moverAbaEmissao("emitente", -1, true), "origem");
  assert.equal(moverAbaEmissao("itens", -1), "destinatario");
});

test("mesma estrutura acessível, campos e comandos nos layouts Padrão e Novo", () => {
  for (const active of [false, true]) {
    let chamadas = 0;
    const acao = () => { chamadas++; };
    const html = renderToStaticMarkup(<OperationalPresentation active={active}><EditorNfe {...props} aba="itens" onEspelho={acao} onSalvar={acao} onEmitir={acao}>{conteudo}</EditorNfe></OperationalPresentation>);
    assert.equal(chamadas, 0, "apresentar a tela não executa ações fiscais");
    assert.match(html, /role="dialog" aria-modal="true"/);
    assert.equal((html.match(/role="tab"/g) ?? []).length, 6);
    assert.equal((html.match(/aria-selected="true"/g) ?? []).length, 1);
    assert.match(html, /role="tab" aria-selected="true"[^>]+tabindex="0"[^>]*>Itens e tributos/);
    assert.match(html, /role="tabpanel"/);
    assert.match(html, /name="referencia" value="Origem preservada"/);
    assert.match(html, /Total da NF-e/);
    const labels = ["Espelho", "Salvar e enviar ao painel", "Emitir agora"];
    const posicoes = labels.map(label => html.indexOf(`>${label}</button>`));
    assert.ok(posicoes.every(p => p >= 0));
    assert.ok(posicoes[0] < posicoes[1] && posicoes[1] < posicoes[2]);
    assert.equal(html.includes("native-operational-button"), active);
  }
});

test("remessa externa oferece registro, e edição pode oferecer somente espelho e salvamento", () => {
  const externa = renderToStaticMarkup(<EditorNfe {...props} onRegistrarExterno={() => {}}>{conteudo}</EditorNfe>);
  assert.match(externa, />Registrar remessa<\/button>/);
  assert.doesNotMatch(externa, />Emitir agora<\/button>|>Espelho<\/button>|>Salvar e enviar ao painel<\/button>/);
  const editando = renderToStaticMarkup(<EditorNfe {...props} onEspelho={() => {}} onSalvar={() => {}}>{conteudo}</EditorNfe>);
  assert.match(editando, />Salvar e enviar ao painel<\/button>/);
  assert.doesNotMatch(editando, />Emitir agora<\/button>/);
});

test("operação em andamento bloqueia os comandos e mantém retorno do erro e totais", () => {
  const html = renderToStaticMarkup(<EditorNfe {...props} ocupado erro="Confira o emitente" financeiro="R$ 200,00" onEspelho={() => {}} onSalvar={() => {}} onEmitir={() => {}}>{conteudo}</EditorNfe>);
  for (const label of ["Cancelar", "Espelho", "Salvar e enviar ao painel", "Emitir agora"])
    assert.match(html, new RegExp(`<button[^>]*disabled[^>]*>${label}</button>`));
  assert.match(html, /role="alert">Confira o emitente/);
  assert.match(html, /role="status">Aguarde/);
  assert.match(html, /Financeiro/);
  assert.match(html, /R\$ 200,00/);
});
