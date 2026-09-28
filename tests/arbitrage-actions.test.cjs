const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const ts=require('typescript');

let db, beforeWrite;
const adapter={prepare(sql){let params=[];return {
 bind(...values){params=values;return this;},
 all(){return {results:db.prepare(sql).all(...params)};},
 run(){const hook=beforeWrite;beforeWrite=null;hook?.();return {meta:{changes:db.prepare(sql).run(...params).changes}};}
};},
async batch(stmts){return stmts.map(s=>s.run());}};
const modules={};
function source(file){
 if(modules[file])return modules[file].exports;
 const module={exports:{}};modules[file]=module;
 const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('require','module','exports',code)(name=>name==='@/lib/store'?{database:()=>adapter}:name==='cloudflare:workers'?{env:{ACCESS_PASSWORD:'teste-senha'}}:name==='vinext/shims/request-context'?{getRequestExecutionContext:()=>null}:name.startsWith('@/')?source(name.slice(2)+'.ts'):name.startsWith('.')?source(path.join(path.dirname(file),name)+'.ts'):require(name),module,module.exports);
 return module.exports;
}
const api=source('app/api/records/route.ts');
const {summary}=source('lib/banca.ts');
const {recordsSnapshot}=source('lib/record-changes.ts');
const {bankSummary}=source('lib/banks.ts');
const row=(id,kind,data)=>({id,kind,data,revision:1});
const account=(id,initial=100000)=>row(id,'account',{house:id,holder:'Teste',initial,note:''});
const bet=(id,account,status='Pendente',stake=10000,returned=0,extra={})=>({id,account,selection:id,capital:'Real',stake,odd:2.1,status,returned,...extra});
const arb=(id,bets,promo=null)=>row(id,'arb',{event:id,market:'Resultado final',date:'2026-09-14',note:'',bets,promo});
const movement=(id,account,type,amount)=>row(id,'movement',{account,type,amount,date:'2026-09-14',note:''});
function insert(r){db.prepare('INSERT INTO records VALUES (?,?,?,?)').run(r.id,r.kind,JSON.stringify(r.data),r.revision);}
function reset(rows){db?.close();db=new DatabaseSync(':memory:');db.exec('CREATE TABLE records (id TEXT PRIMARY KEY,kind TEXT NOT NULL,data TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1)');rows.forEach(insert);beforeWrite=null;}
function rows(){return db.prepare('SELECT * FROM records').all().map(r=>({...r,data:JSON.parse(r.data)}));}
async function call(method,body,origin='https://manel.test',password='teste-senha'){
 const response=await api[method](new Request('https://manel.test/api/records',{method,headers:{'Content-Type':'application/json',origin,'x-access-password':password},body:JSON.stringify(body)}));
 return {status:response.status,data:await response.json()};
}
async function remove(id,revision=1){return call('DELETE',{id,revision});}
async function edit(r){return call('POST',{...r});}

(async()=>{try{
 const a=account('a'),b=account('b');
 const win=arb('win',[bet('one','a','Ganhou',10000,21000),bet('two','b','Perdeu')]);
 reset([a,b,movement('deposit','a','Depósito',5000),win]);
 assert.equal(summary(rows()).netProfit,1000);
 let result=await remove('win');assert.equal(result.status,200);
 assert.deepEqual([summary(result.data.rows).real,summary(result.data.rows).netProfit],[205000,0]);
 assert.equal(result.data.rows.length,3);assert.equal(summary(rows()).accounts.find(a=>a.id==='b').real,100000);
 // 'a' still has the 'deposit' movement linked (only 'win' was removed above), so its
 // deletion is blocked (409/account_dependency) by the dependency guard — not a plain 404.
 assert.equal((await remove('win')).status,404);assert.equal((await remove('a')).status,409);

 reset([a,b,arb('loss',[bet('one','a','Perdeu'),bet('two','b','Cashout',10000,5000)])]);
 assert.equal(summary(rows()).netProfit,-15000);
 result=await remove('loss');assert.equal(result.status,200);assert.equal(summary(result.data.rows).real,200000);

 reset([a,b,arb('pending',[bet('one','a'),bet('two','b')])]);
 assert.equal(summary(rows()).exposure,20000);
 result=await remove('pending');assert.equal(result.status,200);
 assert.deepEqual([summary(result.data.rows).real,summary(result.data.rows).exposure,summary(result.data.rows).open],[200000,0,0]);

 const credit=movement('credit','a','Freebet recebida',10000);
 const extraction=arb('extraction',[bet('one','a','Ganhou',10000,26375,{capital:'Freebet',lot:'credit',previousLoss:3000}),bet('two','b','Perdeu')]);
 reset([account('a',215000),b,credit,extraction]);
 assert.deepEqual([summary(rows()).real,summary(rows()).profit,summary(rows()).netProfit],[331375,16375,13375]);
 const changed=structuredClone(extraction);changed.data.bets[0].previousLoss=4000;
 result=await edit(changed);assert.equal(result.status,200);
 assert.deepEqual([summary(result.data.rows).real,summary(result.data.rows).netProfit],[331375,12375]);
 assert.equal(result.data.rows.find(r=>r.id==='extraction').revision,2);
 assert.equal((await remove('extraction',1)).status,409);
 changed.revision=2;changed.data.bets[0].returned=27375;
 result=await edit(changed);assert.equal(result.status,200);
 assert.deepEqual([summary(result.data.rows).real,summary(result.data.rows).netProfit],[332375,13375]);
 result=await remove('extraction',3);assert.equal(result.status,200);
 assert.deepEqual([summary(result.data.rows).real,summary(result.data.rows).netProfit,summary(result.data.rows).free],[315000,0,10000]);

 const promo={account:'a',status:'Recebida',expected:10000,received:10000,receivedDate:'2026-09-14',expires:'',condition:'',lossPct:null};
 const acquisition=arb('acquisition',[bet('one','a','Perdeu',2000),bet('two','b','Perdeu',2000)],promo);
 const dependent=structuredClone(extraction);dependent.data.bets[0].lot='promo:acquisition';
 reset([a,b,acquisition,dependent]);
 result=await remove('acquisition');assert.equal(result.status,409);assert.equal(result.data.code,'freebet_dependency');assert.equal(rows().length,4);
 assert.equal((await remove('extraction')).status,200);assert.equal(summary(rows()).free,10000);
 assert.equal((await remove('acquisition')).status,200);assert.equal(summary(rows()).free,0);

 // Race: a dependent is recorded after validation but before source deletion.
 reset([a,b,acquisition]);beforeWrite=()=>insert(dependent);
 result=await remove('acquisition');assert.equal(result.status,409);assert.equal(result.data.code,'stale');assert.equal(rows().length,4);
 // Race in the reverse order: no insert can use a source deleted since validation.
 reset([a,b,acquisition]);beforeWrite=()=>db.prepare('DELETE FROM records WHERE id=?').run('acquisition');
 result=await call('POST',{kind:'arb',data:dependent.data});assert.equal(result.status,409);assert.equal(rows().length,2);
 // A concurrent edit cannot be lost, even when another device changes a different record.
 reset([a,b,win]);beforeWrite=()=>db.prepare('UPDATE records SET revision=revision+1 WHERE id=?').run('b');
 result=await edit(win);assert.equal(result.status,409);assert.equal(rows().find(r=>r.id==='win').revision,1);
 reset([a,b,win]);assert.equal((await remove('win',2)).status,409);
 assert.equal((await call('DELETE',{id:'win',revision:1},'https://other.test')).status,403);
 assert.equal(rows().length,3);
 assert.equal(recordsSnapshot(rows()),recordsSnapshot(rows().reverse()));

 // Banks use the same durable records and revision guard, with their own balances.
 reset([a,b,win]);const originalBanca=summary(rows());
 async function addBank(bank,holder,balance){return call('POST',{kind:'bank',data:{bank,holder,balance,note:''}});}
 result=await addBank('Nubank','Manel',100025);assert.equal(result.status,200);
 const manelBank=result.data.rows.find(r=>r.id===result.data.id);
 assert.equal((await addBank('Itaú',' manel ',25050)).status,200);
 assert.equal((await addBank('Nubank','Alex',70000)).status,200);
 let bankTotals=bankSummary(rows());
 assert.equal(bankTotals.people.length,2);
 assert.equal(bankTotals.people.find(p=>p.key==='manel').total,125075);
 assert.equal(bankTotals.people.find(p=>p.key==='alex').total,70000);
 assert.equal(bankTotals.people.find(p=>p.key==='alex').banks.length,1);
 const duplicate=await addBank(' NUBANK ','MANEL',99999);assert.equal(duplicate.status,400);
 assert.equal(bankSummary(rows()).banks.length,3);
 const revisedBank=structuredClone(manelBank);revisedBank.data.balance=80075;
 result=await edit(revisedBank);assert.equal(result.status,200);
 assert.equal(bankSummary(result.data.rows).people.find(p=>p.key==='manel').total,105125);
 assert.equal((await edit(revisedBank)).status,409);
 revisedBank.revision=2;revisedBank.data.bank='Inter';revisedBank.data.holder='Alex';revisedBank.data.balance=-1000;
 result=await edit(revisedBank);assert.equal(result.status,200);
 const persisted=await (await api.GET(new Request('https://manel.test/api/records',{headers:{'x-access-password':'teste-senha'}}))).json();bankTotals=bankSummary(persisted.rows);
 assert.equal(bankTotals.people.find(p=>p.key==='manel').total,25050);
 assert.equal(bankTotals.people.find(p=>p.key==='alex').total,69000);
 assert.equal(bankTotals.people.find(p=>p.key==='alex').banks.length,2);
 const afterBanks=summary(persisted.rows);afterBanks.accounts.sort((a,b)=>a.id.localeCompare(b.id));
 assert.deepEqual(afterBanks,originalBanca);
 // Saque/Depósito on a betting account auto-syncs the matching-holder bank.
 const bankRow=(id,bankName,holder,balance)=>row(id,'bank',{bank:bankName,holder,balance,note:''});
 // Saque credits the matching bank (money leaves the betting account, lands in the bank).
 reset([a,b,bankRow('bk','Nubank','Teste',50000)]);
 result=await call('POST',{kind:'movement',data:{account:'a',type:'Saque',amount:20000,date:'2026-09-14',note:''}});
 assert.equal(result.status,200);assert.equal(result.data.warning,undefined);
 assert.equal(result.data.rows.find(r=>r.id==='bk').data.balance,70000);
 assert.equal(result.data.rows.find(r=>r.id==='bk').revision,2);
 // Depósito debits the matching bank (money leaves the bank, lands in the betting account).
 reset([a,b,bankRow('bk','Nubank','Teste',50000)]);
 result=await call('POST',{kind:'movement',data:{account:'a',type:'Depósito',amount:15000,date:'2026-09-14',note:''}});
 assert.equal(result.status,200);assert.equal(result.data.warning,undefined);
 assert.equal(result.data.rows.find(r=>r.id==='bk').data.balance,35000);
 // A Depósito that would overdraw the matching bank blocks the whole movement.
 reset([a,b,bankRow('bk','Nubank','Teste',5000)]);
 result=await call('POST',{kind:'movement',data:{account:'a',type:'Depósito',amount:15000,date:'2026-09-14',note:''}});
 assert.equal(result.status,400);
 assert.equal(rows().filter(r=>r.kind==='movement').length,0);
 assert.equal(rows().find(r=>r.id==='bk').data.balance,5000);
 // No bank registered for the holder: movement still saves, with a warning, no crash.
 reset([a,b]);
 result=await call('POST',{kind:'movement',data:{account:'a',type:'Saque',amount:20000,date:'2026-09-14',note:''}});
 assert.equal(result.status,200);assert.ok(result.data.warning);
 assert.equal(rows().filter(r=>r.kind==='movement').length,1);
 // Two banks share the holder: ambiguous, so it's skipped with a warning, not guessed.
 reset([a,b,bankRow('bk1','Nubank','Teste',50000),bankRow('bk2','Itaú','Teste',30000)]);
 result=await call('POST',{kind:'movement',data:{account:'a',type:'Saque',amount:20000,date:'2026-09-14',note:''}});
 assert.equal(result.status,200);assert.ok(result.data.warning);
 assert.equal(rows().find(r=>r.id==='bk1').data.balance,50000);
 assert.equal(rows().find(r=>r.id==='bk2').data.balance,30000);
 // Editing an existing movement (has an id/revision) does not re-trigger the sync.
 reset([a,b,bankRow('bk','Nubank','Teste',50000),movement('m1','a','Saque',20000)]);
 result=await edit({kind:'movement',id:'m1',revision:1,data:{account:'a',type:'Saque',amount:30000,date:'2026-09-14',note:''}});
 assert.equal(result.status,200);assert.equal(result.data.warning,undefined);
 assert.equal(rows().find(r=>r.id==='bk').data.balance,50000);
 console.log('Sincronização automática de banco (Saque/Depósito): crédito, débito, saldo insuficiente, banco ausente/ambíguo e edição sem re-sincronização verificados.');

 // Entrada avulsa (aba principal): cria, liquida em Green/Red, edita, exclui e mexe no saldo da casa.
 {
  const avulsa=source('app/api/avulsa/route.ts');
  const {avulsaBalance,avulsaCounts}=source('lib/avulsa.ts');
  const {botCommandSchema,resolveAvulsa,buildSystemPrompt}=source('lib/bot-commands.ts');
  async function av(body){const response=await avulsa.POST(new Request('https://manel.test/api/avulsa',{method:'POST',headers:{'Content-Type':'application/json',origin:'https://manel.test','x-access-password':'teste-senha'},body:JSON.stringify(body)}));return {status:response.status,data:await response.json()};}
  reset([a,b]);
  let r=await av({action:'create',event:'Palmeiras x Santos',markets:['Mais de 2,5 gols'],odd:1.9,stake:5000,accountId:'a',date:'2026-09-27'});
  assert.equal(r.status,200);
  let entry=rows().find(x=>x.kind==='avulsa');
  assert.equal(entry.data.result,'Pendente');assert.equal(entry.data.account,'Teste');assert.equal(entry.data.house,'a');
  let s=summary(rows());
  assert.equal(s.accounts.find(x=>x.id==='a').real,95000);assert.equal(s.accounts.find(x=>x.id==='a').exposure,5000);assert.equal(s.open,1);
  // Conta inexistente é recusada; revisão antiga é recusada.
  assert.equal((await av({action:'create',event:'X',markets:['m'],odd:2,stake:100,accountId:'nao-existe',date:'2026-09-27'})).status,400);
  assert.equal((await av({action:'settle',id:entry.id,revision:99,result:'Green'})).status,409);
  // Green: prêmio = stake × odd, e o lucro entra no saldo real da casa.
  r=await av({action:'settle',id:entry.id,revision:entry.revision,result:'Green'});
  assert.equal(r.status,200);
  entry=rows().find(x=>x.kind==='avulsa');
  assert.equal(entry.data.result,'Green');assert.equal(entry.data.prize,9500);assert.equal(entry.revision,2);
  s=summary(rows());
  assert.equal(s.accounts.find(x=>x.id==='a').real,104500);assert.equal(s.accounts.find(x=>x.id==='a').exposure,0);assert.equal(s.open,0);
  assert.equal(avulsaBalance(rows()),4500);
  // Já liquidada: não liquida de novo.
  assert.equal((await av({action:'settle',id:entry.id,revision:entry.revision,result:'Red'})).status,400);
  // Editar a stake de uma entrada Green recalcula o prêmio.
  r=await av({action:'edit',id:entry.id,revision:entry.revision,event:'Palmeiras x Santos',markets:['Mais de 2,5 gols','Ambas marcam'],odd:2,stake:10000,accountId:'b',date:'2026-09-27'});
  assert.equal(r.status,200);
  entry=rows().find(x=>x.kind==='avulsa');
  assert.equal(entry.data.prize,20000);assert.equal(entry.data.house,'b');assert.deepEqual(entry.data.markets,['Mais de 2,5 gols','Ambas marcam']);
  s=summary(rows());
  assert.equal(s.accounts.find(x=>x.id==='a').real,100000);assert.equal(s.accounts.find(x=>x.id==='b').real,110000);
  // Red desconta a stake.
  r=await av({action:'create',event:'Grêmio x Inter',markets:['Casa'],odd:3,stake:2000,accountId:'a',date:'2026-09-27'});
  assert.equal(r.status,200);
  let red=rows().find(x=>x.kind==='avulsa'&&x.data.event==='Grêmio x Inter');
  r=await av({action:'settle',id:red.id,revision:red.revision,result:'Red'});
  assert.equal(r.status,200);
  red=rows().find(x=>x.id===red.id);
  assert.equal(red.data.prize,0);assert.equal(summary(rows()).accounts.find(x=>x.id==='a').real,98000);
  assert.deepEqual(avulsaCounts(rows()),{total:2,green:1,red:1,pending:0});
  assert.equal(avulsaBalance(rows()),10000-2000);
  // Exclusão devolve o saldo.
  r=await av({action:'delete',id:red.id,revision:red.revision});
  assert.equal(r.status,200);assert.equal(rows().filter(x=>x.kind==='avulsa').length,1);
  assert.equal(summary(rows()).accounts.find(x=>x.id==='a').real,100000);
  // Bot: os comandos avulsa_* passam pelo esquema e o evento é encontrado por nome aproximado.
  for(const cmd of [
   {acao:'avulsa_criar',evento:'Flamengo x Vasco',mercados:['Casa'],odd:1.8,valor:50,conta:'a Teste'},
   {acao:'avulsa_liquidar',evento:'Palmeiras x Santos',resultado:'green'},
   {acao:'avulsa_excluir',evento:'Palmeiras x Santos'},
   {acao:'avulsa_editar',evento:'Palmeiras x Santos',valor:75},
  ])assert.equal(botCommandSchema.safeParse(cmd).success,true,cmd.acao);
  assert.equal(botCommandSchema.safeParse({acao:'avulsa_liquidar',evento:'x',resultado:'empate'}).success,false);
  assert.equal(resolveAvulsa(rows(),'palmeiras santos',false)?.id,entry.id);
  assert.equal(resolveAvulsa(rows(),'palmeiras santos',true),null);
  reset([a,b,row('av1','avulsa',{event:'Bahia x Vitória',markets:['Fora'],odd:2.5,stake:1000,account:'Teste',house:'a',accountId:'a',date:'2026-09-27',result:'Pendente',prize:0})]);
  const prompt=buildSystemPrompt(rows());
  assert.ok(prompt.includes('"acao":"avulsa_criar"'));assert.ok(prompt.includes('- Bahia x Vitória'));
  console.log('Entrada avulsa: cadastro, Green/Red, edição, exclusão, saldo por casa, revisões e comandos do bot verificados.');
 }

 // Telas de detalhe da Visão geral: apostas em aberto (todas as abas) e freebets com uso/vencimento.
 {
  const {openBets,openBetsTotals,freebetDetails,freebetTotals}=source('lib/open-bets.ts');
  const soon=new Date(Date.now()+2*86400000).toISOString().slice(0,10);
  const past='2026-01-01';
  reset([
   a,b,
   movement('fb1','a','Freebet recebida',5000),
   {...movement('fb2','b','Freebet recebida',3000),data:{account:'b',type:'Freebet recebida',amount:3000,date:'2026-09-14',expires:soon,note:'Bônus de boas-vindas'}},
   {...movement('fb3','a','Freebet recebida',2000),data:{account:'a',type:'Freebet recebida',amount:2000,date:'2026-09-01',expires:past,note:''}},
   arb('arb1',[bet('x1','a','Pendente',10000),bet('x2','b','Pendente',2000,0,{capital:'Freebet',lot:'fb2',odd:3})]),
   arb('arb2',[bet('y1','a','Ganhou',5000,9000),bet('y2','b','Perdeu',5000)]),
   row('al1','alavancagem',{group:'alavancagem',sequence:1,cycle:1,stake:1000,prize:0,odd:1.3,market:'Casa',account:'Teste',house:'a',accountId:'a',result:'Pendente',event:'Alav A x B',date:'2026-09-20'}),
   row('cm1','camilo',{event:'Camilo A x B',markets:['Fora'],stake:1500,odd:2,account:'Teste',house:'b',accountId:'b',result:'Green',prize:3000,date:'2026-09-20'}),
   row('av1','avulsa',{event:'Avulsa A x B',markets:['Casa','Ambas marcam'],stake:2500,odd:2.2,account:'Teste',house:'a',accountId:'a',result:'Pendente',prize:0,date:'2026-09-27'}),
   row('od1','odd5',{event:'ODD5 A x B',markets:['Múltipla'],stake:500,odd:5,account:'Teste',house:'a',accountId:'a',result:'Pendente',prize:0,date:'2026-09-27'}),
  ]);
  const open=openBets(rows());
  assert.deepEqual(open.map(o=>o.origin).sort(),['Alavancagem','Arbitragem','Arbitragem','Entrada avulsa','ODD 5']);
  const t=openBetsTotals(open);
  // Real em apostas = 10000 (arb1, real) + 1000 (alavancagem) + 2500 (avulsa); freebet e ODD5 ficam de fora.
  assert.equal(t.exposure,13500);assert.equal(summary(rows()).exposure,13500);
  assert.equal(t.freebetsInPlay,2000);assert.equal(t.count,5);assert.equal(t.events,4);
  const fbBet=open.find(o=>o.betId==='x2');
  assert.equal(fbBet.capital,'Freebet');assert.equal(fbBet.potential,4000);assert.equal(fbBet.accountLabel,'b · Teste');assert.equal(fbBet.countsInExposure,false);
  assert.equal(open.find(o=>o.origin==='Alavancagem').originLabel,'Alavancagem 1,3');
  assert.equal(open.find(o=>o.origin==='ODD 5').countsInExposure,false);
  assert.equal(open.find(o=>o.origin==='Entrada avulsa').selection,'Casa · Ambas marcam');
  const fbs=freebetDetails(rows());
  // Disponíveis primeiro (vencendo antes na frente), depois usadas/vencidas.
  assert.deepEqual(fbs.map(f=>[f.id,f.status,f.remaining]),[['fb2','Disponível',1000],['fb1','Disponível',5000],['fb3','Vencida',2000]]);
  const byId=Object.fromEntries(fbs.map(f=>[f.id,f]));
  assert.equal(byId.fb1.status,'Disponível');assert.equal(byId.fb1.remaining,5000);assert.equal(byId.fb1.source,'Crédito avulso');assert.equal(byId.fb1.recordKind,'movement');
  assert.equal(byId.fb2.used,2000);assert.equal(byId.fb2.uses.length,1);assert.equal(byId.fb2.uses[0].event,'arb1');assert.equal(byId.fb2.daysLeft,2);assert.equal(byId.fb2.sourceLabel,'Bônus de boas-vindas');
  assert.equal(byId.fb3.status,'Vencida');assert.ok(byId.fb3.daysLeft<0);
  const ft=freebetTotals(fbs);
  assert.equal(ft.available,6000);assert.equal(ft.available,summary(rows()).free);assert.equal(ft.received,10000);assert.equal(ft.used,2000);assert.equal(ft.expiringSoonCount,1);assert.equal(ft.expiringSoon,1000);
  // Freebet vinda de arbitragem (promo recebida) aponta para a própria arbitragem.
  reset([a,b,arb('arb9',[bet('z1','a','Ganhou',5000,9000),bet('z2','b','Perdeu',5000)],{account:'a',expected:2000,status:'Recebida',received:2000,receivedDate:'2026-09-15',expires:'',condition:'',lossPct:null})]);
  const linked=freebetDetails(rows());
  assert.equal(linked.length,1);assert.equal(linked[0].source,'Arbitragem');assert.equal(linked[0].recordKind,'arb');assert.equal(linked[0].recordId,'arb9');assert.equal(linked[0].remaining,2000);assert.equal(linked[0].status,'Disponível');
  console.log('Telas de detalhe: apostas em aberto por origem, totais iguais à Visão geral, freebets com uso, origem e vencimento verificados.');
 }

 // Cassino: ganho soma no saldo da conta, perda desconta; visores e totais por pessoa/casa.
 {
  const cassino=source('app/api/cassino/route.ts');
  const {cassinoTotals,cassinoByAccount}=source('lib/cassino.ts');
  async function cs(body){const response=await cassino.POST(new Request('https://manel.test/api/cassino',{method:'POST',headers:{'Content-Type':'application/json',origin:'https://manel.test','x-access-password':'teste-senha'},body:JSON.stringify(body)}));return {status:response.status,data:await response.json()};}
  reset([a,b]);
  assert.equal((await cs({action:'create',type:'Ganho',amount:15000,accountId:'a',date:'2026-09-28',note:'roleta'})).status,200);
  assert.equal((await cs({action:'create',type:'Perda',amount:4000,accountId:'a',date:'2026-09-27',note:''})).status,200);
  assert.equal((await cs({action:'create',type:'Perda',amount:2500,accountId:'b',date:'2026-09-26'})).status,200);
  // Conta inexistente, tipo inválido e valor zero são recusados.
  assert.equal((await cs({action:'create',type:'Ganho',amount:100,accountId:'nao-existe',date:'2026-09-28'})).status,400);
  assert.equal((await cs({action:'create',type:'Empate',amount:100,accountId:'a',date:'2026-09-28'})).status,400);
  assert.equal((await cs({action:'create',type:'Ganho',amount:0,accountId:'a',date:'2026-09-28'})).status,400);
  let s=summary(rows());
  assert.equal(s.accounts.find(x=>x.id==='a').real,100000+15000-4000);
  assert.equal(s.accounts.find(x=>x.id==='b').real,100000-2500);
  assert.equal(s.open,0);assert.equal(s.exposure,0);
  let t=cassinoTotals(rows());
  assert.deepEqual(t,{gains:15000,losses:6500,balance:8500,gainCount:1,lossCount:2,count:3});
  let by=cassinoByAccount(rows());
  assert.deepEqual(by.map(x=>[x.house,x.gains,x.losses,x.balance,x.count]),[['a',15000,4000,11000,2],['b',0,2500,-2500,1]]);
  // Editar: troca perda por ganho e muda de conta; revisão antiga é recusada.
  const perdaB=rows().find(r=>r.kind==='cassino'&&r.data.house==='b');
  assert.equal((await cs({action:'edit',id:perdaB.id,revision:99,type:'Ganho',amount:2500,accountId:'b',date:'2026-09-26',note:''})).status,409);
  assert.equal((await cs({action:'edit',id:perdaB.id,revision:perdaB.revision,type:'Ganho',amount:3000,accountId:'a',date:'2026-09-26',note:'slots'})).status,200);
  const edited=rows().find(r=>r.id===perdaB.id);
  assert.equal(edited.data.type,'Ganho');assert.equal(edited.data.house,'a');assert.equal(edited.data.note,'slots');assert.equal(edited.revision,2);
  s=summary(rows());
  assert.equal(s.accounts.find(x=>x.id==='a').real,100000+15000-4000+3000);
  assert.equal(s.accounts.find(x=>x.id==='b').real,100000);
  // Excluir devolve o saldo.
  assert.equal((await cs({action:'delete',id:edited.id,revision:edited.revision})).status,200);
  assert.equal(rows().filter(r=>r.kind==='cassino').length,2);
  assert.equal(summary(rows()).accounts.find(x=>x.id==='a').real,100000+15000-4000);
  t=cassinoTotals(rows());assert.equal(t.balance,11000);
  console.log('Cassino: ganho/perda por pessoa e casa, visores, totais por conta, edição, exclusão e saldo da conta verificados.');
 }

 // Exclusão de conta: bloqueada quando há entradas de qualquer aba apontando para ela.
 {
  const {accountDependencies,hasAccountDependencies}=source('lib/record-changes.ts');
  const base=[a,b];
  reset(base);
  assert.equal(hasAccountDependencies(rows(),'a'),false);
  let r=await remove('a');assert.equal(r.status,200);
  for(const [label,extra] of [
   ['alavancagem',row('x','alavancagem',{group:'alavancagem',sequence:1,cycle:1,stake:1000,prize:0,odd:1.3,market:'Casa',account:'Teste',house:'a',accountId:'a',result:'Pendente',event:'E',date:'2026-09-20'})],
   ['odd5',row('x','odd5',{event:'E',markets:['m'],stake:500,odd:5,account:'Teste',house:'a',accountId:'a',result:'Green',prize:2500,date:'2026-09-20'})],
   ['camilo',row('x','camilo',{event:'E',markets:['m'],stake:500,odd:2,account:'Teste',house:'a',accountId:'a',result:'Red',prize:0,date:'2026-09-20'})],
   ['avulsa',row('x','avulsa',{event:'E',markets:['m'],stake:500,odd:2,account:'Teste',house:'a',accountId:'a',result:'Pendente',prize:0,date:'2026-09-20'})],
   ['cassino',row('x','cassino',{type:'Ganho',amount:500,account:'Teste',house:'a',accountId:'a',date:'2026-09-20',note:''})],
   // entrada antiga, sem accountId: casa por titular + casa
   ['avulsa sem accountId',row('x','avulsa',{event:'E',markets:['m'],stake:500,odd:2,account:'teste',house:'A',result:'Green',prize:1000,date:'2026-09-20'})],
  ]){
   reset([...base,extra]);
   assert.equal(hasAccountDependencies(rows(),'a'),true,label);
   assert.equal(hasAccountDependencies(rows(),'b'),false,label);
   r=await remove('a');assert.equal(r.status,409,label);assert.equal(r.data.code,'account_dependency',label);
   assert.ok(rows().some(x=>x.id==='a'),label+': conta preservada');
  }
  reset([...base,movement('m1','a','Depósito',1000),row('c1','cassino',{type:'Perda',amount:500,account:'Teste',house:'a',accountId:'a',date:'2026-09-20',note:''})]);
  const deps=accountDependencies(rows(),'a');
  assert.equal(deps.total,2);assert.deepEqual(deps.labels,['1 movimentações','1 registros de Cassino']);
  console.log('Exclusão de conta: bloqueio cobre movimentações, arbitragens, Alavancagem, ODD 5, Camilo, Entrada avulsa e Cassino (com e sem accountId).');
 }

 // Bot: comandos do cassino passam pelo esquema e o registro é achado por conta + valor (+ data).
 {
  const {botCommandSchema,resolveCassino,buildSystemPrompt}=source('lib/bot-commands.ts');
  for(const cmd of [
   {acao:'cassino_criar',tipo:'ganho',valor:200,conta:'a Teste',observacao:'roleta'},
   {acao:'cassino_criar',tipo:'perda',valor:50.5,conta:'a Teste',data:'2026-09-28'},
   {acao:'cassino_excluir',conta:'a Teste',valor:200},
   {acao:'cassino_editar',conta:'a Teste',valor:200,novoValor:150},
  ])assert.equal(botCommandSchema.safeParse(cmd).success,true,cmd.acao);
  assert.equal(botCommandSchema.safeParse({acao:'cassino_criar',tipo:'empate',valor:10,conta:'a'}).success,false);
  reset([a,b,
   row('c1','cassino',{type:'Ganho',amount:20000,account:'Teste',house:'a',accountId:'a',date:'2026-09-20',note:''}),
   row('c2','cassino',{type:'Ganho',amount:20000,account:'Teste',house:'a',accountId:'a',date:'2026-09-27',note:''}),
   row('c3','cassino',{type:'Perda',amount:20000,account:'Teste',house:'b',accountId:'b',date:'2026-09-27',note:''}),
  ]);
  assert.equal(resolveCassino(rows(),'a',20000)?.id,'c2'); // sem data: o mais recente
  assert.equal(resolveCassino(rows(),'a',20000,'2026-09-20')?.id,'c1');
  assert.equal(resolveCassino(rows(),'a',999),null);
  const prompt=buildSystemPrompt(rows());
  assert.ok(prompt.includes('"acao":"cassino_criar"'));assert.ok(prompt.includes('Últimos registros de cassino'));assert.ok(prompt.includes('R$ 200,00'));
  console.log('Bot do cassino: esquema, prompt e identificação do registro por conta/valor/data verificados.');
 }

 // Exportação: planilha achatada (uma linha por registro/aposta) e backup JSON completo.
 {
  const {exportRows,exportCsv,exportJson,CSV_COLUMNS}=source('lib/export.ts');
  reset([a,b,
   movement('m1','a','Depósito',10000),
   arb('arb1',[bet('x1','a','Ganhou',10000,21000),bet('x2','b','Perdeu',10000)]),
   row('c1','cassino',{type:'Perda',amount:2500,account:'Teste',house:'a',accountId:'a',date:'2026-09-20',note:'slots'}),
   row('od','odd5_setting',{value:500}),
  ]);
  const lines=exportRows(rows());
  assert.equal(lines.length,2+1+2+1); // 2 contas + 1 movimentação + 2 apostas + 1 cassino (a configuração não entra)
  assert.deepEqual(lines.slice(0,2).map(l=>l.Origem),['Conta','Conta']);
  const win=lines.find(l=>l.Origem==='Arbitragem'&&l.Situação==='Ganhou');
  assert.equal(win['Resultado (R$)'],'110,00');assert.equal(win['Stake (R$)'],'100,00');assert.equal(win.Odd,'2,10');assert.equal(win.Casa,'a');
  assert.equal(lines.find(l=>l.Origem==='Cassino')['Resultado (R$)'],'-25,00');
  const csv=exportCsv(rows());
  assert.ok(csv.startsWith('﻿'+CSV_COLUMNS.join(';')));
  assert.equal(csv.split('\r\n').length,lines.length+2);
  const json=JSON.parse(exportJson(rows(),new Date('2026-09-28T12:00:00Z')));
  assert.equal(json.records,rows().length);assert.equal(json.rows.find(r=>r.id==='arb1').data.bets.length,2);
  console.log('Exportação: planilha CSV (BOM, ponto e vírgula, valores em reais) e backup JSON verificados.');
 }

 // Pessoas: resultado por pessoa somando todas as origens, só liquidadas, no período.
 {
  const {peopleResults,peopleTotals}=source('lib/people-results.ts');
  const c=row('c','account',{house:'c',holder:'Outra',initial:50000,note:''});
  reset([a,b,c,
   arb('arb1',[bet('x1','a','Ganhou',10000,21000),bet('x2','b','Perdeu',10000)]), // Teste: +11000 e -10000
   arb('arb2',[bet('y1','c','Pendente',5000),bet('y2','a','Pendente',5000)]),       // pendente: não conta
   row('al','alavancagem',{group:'alavancagem',sequence:1,cycle:1,stake:1000,prize:1300,odd:1.3,market:'Casa',account:'Teste',house:'a',accountId:'a',result:'Green',event:'E',date:'2026-09-14'}), // +300
   row('cm','camilo',{event:'E',markets:['m'],stake:500,odd:2,account:'Outra',house:'c',accountId:'c',result:'Red',prize:0,date:'2026-09-14'}), // Outra: -500
   row('cs','cassino',{type:'Ganho',amount:2000,account:'Outra',house:'c',accountId:'c',date:'2026-09-14',note:''}), // Outra: +2000
   row('old','avulsa',{event:'E',markets:['m'],stake:500,odd:3,account:'Teste',house:'a',accountId:'a',result:'Green',prize:1500,date:'2026-08-01'}), // agosto: fora do período
  ]);
  const month={mode:'month',year:2026,month:9};
  const list=peopleResults(rows(),month);
  assert.deepEqual(list.map(p=>[p.name,p.total,p.count]),[['Outra',1500,2],['Teste',1300,3]]);
  const teste=list.find(p=>p.name==='Teste');
  assert.equal(teste.byOrigin.arb,1000);assert.equal(teste.byOrigin.alavancagem,300);assert.equal(teste.byOrigin.avulsa,0);
  assert.deepEqual(teste.accounts.map(x=>[x.house,x.total]),[['a',11300],['b',-10000]]);
  const all=peopleResults(rows(),{mode:'all'});
  assert.equal(all.find(p=>p.name==='Teste').byOrigin.avulsa,1000);
  const t=peopleTotals(list);
  assert.equal(t.total,2800);assert.equal(t.people,2);assert.equal(t.positive,2);assert.equal(t.byOrigin.cassino,2000);
  console.log('Pessoas: resultado por pessoa e por casa, por origem, só liquidadas e dentro do período verificados.');
 }

 // The API rejects requests without the correct access password, on every verb.
 reset([a,b]);
 assert.equal((await api.GET(new Request('https://manel.test/api/records'))).status,401);
 assert.equal((await api.GET(new Request('https://manel.test/api/records',{headers:{'x-access-password':'errada'}}))).status,401);
 assert.equal((await call('POST',{kind:'account',data:{house:'x',holder:'y',initial:0,note:''}},'https://manel.test','')).status,401);
 console.log('Acesso: GET/POST sem a senha correta são recusados com 401.');

 console.log('Bancos: cadastro por pessoa, saldos individuais, totais, duplicidade, edição e persistência verificados.');
 console.log('Arbitragens: edição, exclusão, recálculo por conta, perda anterior, freebets, revisões e concorrência verificados com SQLite local.');
}finally{db?.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
