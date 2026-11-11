// Executar com o loader de TypeScript/TSX descrito no relatório.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {OperationalGrid,OperationalButton} from '../../../components/OperationalUI';
import {OperationalPresentation} from '../../../components/arato-layout/presentation-mode';
import SelectBusca from '../../../components/SelectBusca';
for(const active of [false,true])test(`Apresentação ${active?'nova':'padrão'} mantém tabela, título e comando no HTML`,()=>{
 const html=renderToStaticMarkup(createElement(OperationalPresentation,{active,children:createElement(OperationalGrid,{'data-op-title':'Contas'},createElement('tbody',null,createElement('tr',null,createElement('td',null,'Título A'),createElement('td',null,createElement(OperationalButton,null,'Baixar')))))}));
 assert.match(html,/<table/);assert.match(html,/Título A/);assert.match(html,/>Baixar</);assert.equal(html.includes('native-data-grid'),active);
});
test('Seletor mostra placeholder quando o ID salvo não veio nas opções',()=>{
 const html=renderToStaticMarkup(createElement(SelectBusca,{value:'salvo-na-fazenda-B',onChange:()=>{},options:[{value:'outra-fazenda',label:'Centro administrativo'}],placeholder:'Selecione o centro'}));
 assert.match(html,/Selecione o centro/);assert.doesNotMatch(html,/Centro administrativo/);
});
