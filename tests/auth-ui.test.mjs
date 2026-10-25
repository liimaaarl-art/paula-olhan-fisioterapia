import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
const html=await readFile(new URL('../login.html',import.meta.url),'utf8'),script=await readFile(new URL('../auth-ui.js',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function app(hash='',fetcher=async()=>({ok:true,json:async()=>null})){
  const dom=new JSDOM(html,{url:'https://clinic.example/login.html'+hash,runScripts:'outside-only'});dom.window.fetch=async(...args)=>{const response=await fetcher(...args);if(!response.text)response.text=async()=>JSON.stringify(await response.json());return response};dom.window.eval(script);await tick();return dom;
}
test('primeiro acesso abre formulário e envia somente e-mail cadastrado',async()=>{
  const calls=[];const dom=await app('',async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>null}}),w=dom.window;
  w.document.getElementById('forgot').click();const form=w.document.querySelector('form');form.elements.email.value='owner@example.test';form.dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();
  const request=calls.at(-1);assert.equal(request.url,'/api/auth/request-password-reset');assert.deepEqual(JSON.parse(request.options.body),{email:'owner@example.test'});assert.match(w.document.getElementById('access-message').textContent,/Se o e-mail estiver cadastrado/);w.close();
});
test('manter conectado é escolha explícita e não salva senha no armazenamento do aplicativo',async()=>{
  for(const remember of [false,true]){
    const calls=[];const dom=await app('',async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>url.endsWith('get-session')?null:{twoFactorRedirect:true}}}),w=dom.window;
    const form=w.document.querySelector('form');assert.equal(form.elements.remember.checked,false);
    assert.equal(form.elements.email.autocomplete,'username');assert.equal(form.elements.password.autocomplete,'current-password');
    form.elements.email.value='owner@example.test';form.elements.password.value='Senha-apenas-no-teste-123';form.elements.remember.checked=remember;
    form.dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();
    assert.equal(JSON.parse(calls.at(-1).options.body).rememberMe,remember);assert.equal(w.localStorage.length,0);assert.equal(w.sessionStorage.length,0);w.close();
  }
});
test('resposta não JSON na entrada mostra orientação em português sem apagar os campos',async()=>{
  const dom=await app('',async url=>url.endsWith('get-session')?{ok:true,text:async()=>'null'}:{ok:false,status:404,text:async()=>'The page could not be found\nNOT_FOUND'}),w=dom.window;
  const form=w.document.querySelector('form');form.elements.email.value='owner@example.test';form.elements.password.value='Senha-de-teste-123';
  form.dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();
  assert.match(w.document.getElementById('access-message').textContent,/Atualize a página/);
  assert.doesNotMatch(w.document.getElementById('access-message').textContent,/expected pattern|NOT_FOUND/);
  assert.equal(form.elements.email.value,'owner@example.test');assert.equal(form.elements.password.value,'Senha-de-teste-123');assert.equal(form.querySelector('button').disabled,false);w.close();
});
test('link remove token do endereço e não envia senha se confirmação divergir',async()=>{
  const calls=[];const dom=await app('#reset=one-time-test-token',async(...args)=>{calls.push(args);return {ok:true,json:async()=>({status:true})}}),w=dom.window;
  assert.equal(w.location.hash,'');const form=w.document.querySelector('form');form.elements.password.value='Senha-somente-teste-123';form.elements.repeat.value='Senha-diferente-456';form.dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();
  assert.equal(calls.length,0);assert.match(w.document.getElementById('access-message').textContent,/iguais/);assert.equal(w.localStorage.length,0);w.close();
});
test('link de login pede ação humana e permite usar código no navegador original',async()=>{
  const calls=[];const dom=await app('#confirm=12345678',async(...args)=>{calls.push(args);return {ok:true,json:async()=>({status:true})}}),w=dom.window;
  assert.equal(w.location.hash,'');assert.equal(w.document.querySelector('[name="code"]').value,'12345678');assert.equal(calls.length,0);assert.match(w.document.body.textContent,/navegador/);assert.equal(w.localStorage.length,0);w.close();
});
test('build estático não publica HTML clínico, fontes do servidor ou credenciais',async()=>{
  const {readdir}=await import('node:fs/promises');const files=await readdir(new URL('../public/',import.meta.url));
  for(const forbidden of ['index.html','api','lib','migrations','.env','package.json'])assert.ok(!files.includes(forbidden));
  assert.ok(files.includes('login.html'));assert.ok(files.includes('auth-ui.js'));
});
