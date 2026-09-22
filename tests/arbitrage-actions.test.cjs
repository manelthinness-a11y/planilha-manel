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

 // The API rejects requests without the correct access password, on every verb.
 reset([a,b]);
 assert.equal((await api.GET(new Request('https://manel.test/api/records'))).status,401);
 assert.equal((await api.GET(new Request('https://manel.test/api/records',{headers:{'x-access-password':'errada'}}))).status,401);
 assert.equal((await call('POST',{kind:'account',data:{house:'x',holder:'y',initial:0,note:''}},'https://manel.test','')).status,401);
 console.log('Acesso: GET/POST sem a senha correta são recusados com 401.');

 console.log('Bancos: cadastro por pessoa, saldos individuais, totais, duplicidade, edição e persistência verificados.');
 console.log('Arbitragens: edição, exclusão, recálculo por conta, perda anterior, freebets, revisões e concorrência verificados com SQLite local.');
}finally{db?.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
