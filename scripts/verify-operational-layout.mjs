import{readFileSync,existsSync}from'node:fs';import{resolve}from'node:path';import assert from'node:assert/strict';
const root=process.cwd(),read=p=>readFileSync(resolve(root,p),'utf8');
try{
 const metadata=JSON.parse(read('arato-layout-integration.json'));
 assert.equal(metadata.version,1);assert.equal(metadata.default_layout,'original');
 for(const name of['TopNav','LayoutShell','AppearanceSettings','OperationalUI'])assert.ok(existsSync(resolve(root,'components/'+name+'Original.tsx')),'Componente original não preservado: '+name);
 assert.ok(read('components/LayoutShell.tsx').includes('<LayoutChoiceProvider'),'Provedor da alternância ausente.');
 assert.ok(read('components/AppearanceSettings.tsx').includes('<LayoutChoiceControl/>'),'Seletor de layout ausente da aparência.');
 const choice=read('components/arato-layout/layout-choice.tsx');assert.ok(choice.includes('arato-layout-choice-v2:')&&choice.includes('Usar novo layout'),'Controle ou preferência ausentes.');
 assert.ok(read('app/layout.tsx').includes('./arato-operational.css'),'CSS do novo layout ausente.');
 const chrome=read('components/arato-layout/OperationalChrome.tsx');assert.ok(chrome.includes('data-navigation="levels"')&&chrome.includes('native-function-branch'),'Navegação por níveis ausente.');
 const pkg=JSON.parse(read('package.json'));assert.ok(pkg.scripts.prebuild.includes('node scripts/verify-operational-layout.mjs'),'A verificação precisa preceder a compilação.');
 console.log('Integração de layout conferida: original como padrão, seletor e navegação operacional presentes.');
}catch(error){console.error('PUBLICAÇÃO BLOQUEADA: integração do layout incompleta. '+error.message);process.exitCode=1;}
