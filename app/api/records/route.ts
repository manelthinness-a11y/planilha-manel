import {database} from '@/lib/store';
import {z} from 'zod';
import {summary,grantsOf} from '@/lib/banca';
import {combinationLabel} from '@/lib/markets';
import {recordsSnapshot,insertRecordSql,updateRecordSql,deleteArbitrageSql,freebetDependents} from '@/lib/record-changes';
import {bankNameKey} from '@/lib/banks';
import {prepareBankOperation} from '@/lib/bank-transactions';
import {backupLog} from '@/lib/backup';
import {checkAccess,unauthorized} from '@/lib/auth';
import {alertArbSettled} from '@/lib/alerts';
function summarize(kind:string,data:any):string{
 if(kind==='account')return data.house+' · '+data.holder;
 if(kind==='movement')return data.type+' · R$ '+(data.amount/100).toFixed(2).replace('.',',');
 if(kind==='bank')return data.bank+' · '+data.holder;
 if(kind==='arb')return data.event+' · '+data.market;
 if(kind==='commission_person')return data.name;
 if(kind==='commission_entry')return data.type+' · R$ '+(data.amount/100).toFixed(2).replace('.',',');
 return kind;
}
const brl=(cents:number)=>(cents/100).toFixed(2).replace('.',',');
const accountLabel=(rows:any[],id:string)=>{const a=rows.find((r:any)=>r.kind==='account'&&r.id===id);return a?a.data.house+' · '+a.data.holder:id;};
const personLabel=(rows:any[],id:string)=>{const p=rows.find((r:any)=>r.kind==='commission_person'&&r.id===id);return p?p.data.name:id;};
const betsLabel=(rows:any[],bets:any[])=>bets.map((b:any)=>accountLabel(rows,b.account)+': R$ '+brl(b.stake)+' @ '+b.odd+' ('+b.status+(['Ganhou','Cashout'].includes(b.status)?', retorno R$ '+brl(b.returned):'')+')').join(' | ');
function backupColumns(kind:string,action:'create'|'update'|'delete',data:any,rows:any[]):[string,string|number][]{
 const acao=action==='create'?'Cadastro':action==='update'?'Atualização':'Exclusão';
 if(kind==='account')return [['Ação',acao],['Casa',data.house],['Titular',data.holder],['Saldo inicial (R$)',brl(data.initial)],['Observação',data.note||'']];
 if(kind==='movement')return [['Ação',acao],['Conta',accountLabel(rows,data.account)],['Tipo',data.type],['Valor (R$)',brl(data.amount)],['Data',data.date],['Observação',data.note||'']];
 if(kind==='bank')return [['Ação',acao],['Banco',data.bank],['Titular',data.holder],['Saldo (R$)',brl(data.balance)],['Observação',data.note||'']];
 if(kind==='arb')return [['Ação',acao],['Evento',data.event],['Mercado',data.market],['Data',data.date],['Nº apostas',data.bets.length],['Apostas',betsLabel(rows,data.bets)],['Observação',data.note||'']];
 if(kind==='commission_person')return [['Ação',acao],['Nome',data.name],['Observação',data.note||'']];
 if(kind==='commission_entry')return [['Ação',acao],['Pessoa',personLabel(rows,data.personId)],['Tipo',data.type],['Valor (R$)',brl(data.amount)],['Data',data.date],['Observação',data.note||'']];
 return [];
}
const cents=z.number().int().min(0).max(10000000000), str=z.string().trim().min(1).max(200);
const bet=z.object({id:str,groupId:str.optional(),account:str,selection:z.string().trim().min(1).max(5000),combination:z.array(z.object({market:str,selection:str})).max(12).optional(),capital:z.enum(['Real','Freebet']),lot:z.string().optional(),previousLoss:cents.optional(),stake:cents.positive(),odd:z.number().min(1).max(10000),status:z.enum(['Pendente','Ganhou','Perdeu','Cancelada','Cashout']),returned:cents,reissued:z.boolean().optional()});
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const bankSchema=z.object({bank:str.transform(v=>v.replace(/\s+/g,' ')),holder:str.transform(v=>v.replace(/\s+/g,' ')),balance:z.number().int().min(-10000000000).max(10000000000),note:z.string().max(1000).default('')});
const promo=z.object({account:str,expected:cents.positive(),status:z.enum(['Aguardando','Recebida','Não recebida']),received:cents.default(0),receivedDate:z.union([date,z.literal('')]).default(''),expires:z.union([date,z.literal('')]).default(''),condition:z.string().max(1000).default(''),lossPct:z.number().min(0).max(100).nullable().default(null)}).superRefine((p,c)=>{if(p.status==='Recebida'&&(!p.received||!p.receivedDate))c.addIssue({code:z.ZodIssueCode.custom,message:'Informe o valor e a data de recebimento'});if(p.status==='Recebida'&&p.expires&&p.expires<p.receivedDate)c.addIssue({code:z.ZodIssueCode.custom,message:'Vencimento anterior ao recebimento'});});
const schemas={bank:bankSchema,account:z.object({house:str,holder:str,initial:cents,note:z.string().max(1000).default('')}),movement:z.object({account:str,type:z.enum(['Depósito','Saque','Ajuste positivo','Ajuste negativo','Freebet recebida']),amount:cents.positive(),date:str,expires:z.string().optional(),note:z.string().max(1000).default('')}),arb:z.object({event:str,market:str,date:str,note:z.string().max(1000).default(''),bets:z.array(bet).min(2).max(60),promo:promo.nullable().optional()}),commission_person:z.object({name:str,note:z.string().max(1000).default('')}),commission_entry:z.object({personId:str,type:z.enum(['Comissão','Débito','Pagamento']),amount:cents.positive(),date:str,note:z.string().max(1000).default('')})};
async function all(){const r=await database().prepare('SELECT * FROM records ORDER BY rowid DESC').all();return r.results.map((r:any)=>({...r,data:JSON.parse(r.data)}));}
export async function GET(req:Request){if(!checkAccess(req))return unauthorized();try{return Response.json({rows:await all()},{headers:{'Cache-Control':'no-store, max-age=0'}});}catch(e){console.error(e);return Response.json({error:'Não foi possível carregar os dados. Tente novamente.'},{status:503});}}
export async function POST(req:Request){if(!checkAccess(req))return unauthorized();try{
 const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)return Response.json({error:'Origem inválida'},{status:403});
 const body=z.object({kind:z.enum(["account","movement","arb","bank","commission_person","commission_entry"]),data:z.unknown(),id:z.string().optional(),revision:z.number().int().optional()}).parse(await req.json());if(!Object.hasOwn(schemas,body.kind))throw new Error('Registro inválido');
 const data:any=schemas[body.kind as keyof typeof schemas].parse(body.data);const rows=await all();const old=body.id?rows.find((r:any)=>r.id===body.id):null;
 if(body.id&&(!old||old.kind!==body.kind))throw new Error('Registro não encontrado');
 // Para o alerta de "arbitragem liquidada": só dispara quando ela SAI do estado pendente (nasce quitada não conta).
 const oldArbBetsDone=body.kind==='arb'&&old?!old.data.bets.some((b:any)=>b.status==='Pendente'):false;
 if(old&&old.revision!==body.revision)return Response.json({error:'Este registro mudou em outro dispositivo. Atualize antes de editar.',code:'stale'},{status:409});
 if(body.kind==='bank'&&rows.some((r:any)=>r.kind==='bank'&&r.id!==body.id&&bankNameKey(r.data.bank)===bankNameKey(data.bank)&&bankNameKey(r.data.holder)===bankNameKey(data.holder)))return Response.json({error:'Este banco já está cadastrado para essa pessoa. Edite o banco existente para atualizar o saldo.'},{status:400});
 if(body.kind==='account'&&rows.some((r:any)=>r.kind==='account'&&r.id!==body.id&&r.data.house.toLowerCase()===data.house?.toLowerCase()&&r.data.holder.toLowerCase()===data.holder?.toLowerCase()))throw new Error('Essa casa e titular já estão cadastrados');
 if(body.kind==='commission_person'&&rows.some((r:any)=>r.kind==='commission_person'&&r.id!==body.id&&r.data.name.toLowerCase()===data.name?.toLowerCase()))throw new Error('Essa pessoa já está cadastrada em Comissões');
 if(body.kind==='commission_entry'&&!rows.some((r:any)=>r.kind==='commission_person'&&r.id===(data as any).personId))throw new Error('Selecione uma pessoa válida');
 const accounts=new Set(rows.filter((r:any)=>r.kind==='account').map((r:any)=>r.id));
 if(body.kind==='movement'&&!accounts.has((data as any).account))throw new Error('Selecione uma conta válida');
 if(body.kind==='arb')for(const b of (data as any).bets){if(!accounts.has(b.account))throw new Error('Selecione uma conta válida');if(b.capital==='Freebet'&&!grantsOf(rows).some((g:any)=>g.id===b.lot&&g.account===b.account))throw new Error('Selecione a freebet correspondente à conta');}
 if(body.kind==='arb'&&data.promo&&!accounts.has(data.promo.account))throw new Error('Selecione a conta que receberá a freebet');
 if(body.kind==='arb'){
  for(const b of data.bets){if(b.combination?.length)b.selection=combinationLabel(b.combination);}
  const groups=new Map<string,any[]>();
  for(const b of data.bets){if(!b.groupId)continue;const g=groups.get(b.groupId)||[];g.push(b);groups.set(b.groupId,g);}
  for(const g of groups.values()){if(new Set(g.map((b:any)=>b.account)).size!==g.length)throw new Error('Na aposta dividida, escolha uma conta diferente para cada parte.');if(new Set(g.map((b:any)=>b.selection)).size!==1)throw new Error('As partes de uma aposta dividida devem ter a mesma seleção.');}
 }
 const id=old?.id||crypto.randomUUID();const next=[...rows.filter((r:any)=>r.id!==id),{id,kind:body.kind,data,revision:1}];for(const r of next.filter((r:any)=>r.kind==="arb")){for(const b of r.data.bets){if(b.capital!=="Freebet")continue;const g=grantsOf(next).find((g:any)=>g.id===b.lot&&g.account===b.account);if(!g)throw new Error("Uma aposta depende desta freebet. Mantenha a conta e o tipo do crédito.");if(r.data.date<g.date||(g.expires&&r.data.date>g.expires))throw new Error("A data da aposta deve estar dentro da validade da freebet.");}}const s=summary(next);if(s.grants.some((g:any)=>g.remaining<0))throw new Error('Valor maior que a freebet disponível');
 // A new "Saque"/"Depósito" on a betting account keeps the matching-holder bank in sync
 // automatically: a saque credits that bank, a depósito debits it (mirrors prepareBankOperation
 // in lib/bank-transactions.ts, which the manual Bancos tab already uses). Only for brand-new
 // movements (editing one doesn't re-sync — this would need to know and undo the old effect
 // first) and only when exactly one bank shares the account's holder; 0 or 2+ matches skip the
 // sync and surface a warning instead of guessing wrong or blocking the movement entry itself.
 let bankOp:{sql:string;bindings:unknown[];count:number;changes:{id:string;revision:number;[k:string]:unknown}[]}|null=null,bankWarning:string|null=null;
 if(body.kind==='movement'&&!old&&(data.type==='Saque'||data.type==='Depósito')){
  const acc=rows.find((r:any)=>r.kind==='account'&&r.id===(data as any).account);
  if(acc){
   const banksOfHolder=rows.filter((r:any)=>r.kind==='bank'&&bankNameKey(r.data.holder)===bankNameKey(acc.data.holder));
   if(banksOfHolder.length===1)bankOp=prepareBankOperation(rows,{type:data.type==='Saque'?'deposit':'withdraw',source:banksOfHolder[0].id,sourceRevision:banksOfHolder[0].revision,amount:(data as any).amount});
   else bankWarning=banksOfHolder.length===0?`Nenhum banco cadastrado para "${acc.data.holder}" — o saldo do banco não foi atualizado automaticamente.`:`Mais de um banco cadastrado para "${acc.data.holder}" — não deu pra saber qual banco atualizar automaticamente.`;
  }
 }
 const snapshot=recordsSnapshot(rows);
 const insertStmt=old?database().prepare(updateRecordSql).bind(JSON.stringify(data),id,body.revision,snapshot):database().prepare(insertRecordSql).bind(id,body.kind,JSON.stringify(data),snapshot);
 let res;
 if(bankOp){
  // The bank UPDATE runs second in the same D1 batch (one implicit transaction), so by the time
  // it executes, the movement row above has already been inserted — its snapshot check has to
  // expect a table that INCLUDES that new row, not the pre-insert snapshot prepareBankOperation
  // computed from `rows`. Swap in the post-insert snapshot for just that one binding.
  const postInsertSnapshot=recordsSnapshot([...rows,{id,revision:1} as any]);
  const bankBindings=[...bankOp.bindings];bankBindings[bankBindings.length-1]=postInsertSnapshot;
  const results=await database().batch([insertStmt,database().prepare(bankOp.sql).bind(...bankBindings)]);
  res=results[0];
  if(res.meta.changes&&!results[1].meta.changes)bankWarning='O banco vinculado mudou em outro dispositivo bem na hora do lançamento — o saldo não foi atualizado automaticamente. Confira e ajuste manualmente se precisar.';
 }else{
  res=await insertStmt.run();
 }
 if(!res.meta.changes)return Response.json({error:'Os dados mudaram em outro dispositivo. Sincronize e confira o registro antes de salvar novamente.',code:'stale'},{status:409});
 const saved={id,kind:body.kind,data,revision:old?old.revision+1:1};
 await backupLog({kind:body.kind,action:old?'update':'create',id,revision:saved.revision,summary:summarize(body.kind,data),data,columns:backupColumns(body.kind,old?'update':'create',data,rows)});
 if(body.kind==='arb'&&!oldArbBetsDone&&!data.bets.some((b:any)=>b.status==='Pendente')){
  const arbResult=s.arbs.find((a:any)=>a.id===id);
  if(arbResult)await alertArbSettled(arbResult.event,arbResult.market,arbResult.result,arbResult.extractionResult);
 }
 // If the bank sync landed, swap in its post-update row too — otherwise the response would hand
 // back the bank's stale pre-sync balance until the client's next full refetch.
 const bankSynced=bankOp&&!bankWarning?bankOp.changes:[];
 const rest=rows.filter((r:any)=>r.id!==id&&!bankSynced.some(b=>b.id===r.id));
 return Response.json({id,rows:[saved,...bankSynced,...rest],...(bankWarning?{warning:bankWarning}:{})},{headers:{'Cache-Control':'no-store'}});
 }catch(e){console.error(e);return Response.json({error:e instanceof z.ZodError?'Confira os campos obrigatórios e valores.':e instanceof Error?e.message:'Não foi possível salvar.'},{status:400});}}

export async function DELETE(req:Request){if(!checkAccess(req))return unauthorized();try{
 const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)return Response.json({error:'Origem inválida'},{status:403});
 const body=z.object({id:z.string().min(1),revision:z.number().int().positive()}).parse(await req.json());
 const rows=await all();const old=rows.find((r:any)=>r.id===body.id);
 if(old?.kind==='account'){
  if(old.revision!==body.revision)return Response.json({error:'Esta conta mudou. Sincronize antes de excluir.',code:'stale'},{status:409});
  const linked=rows.some((r:any)=>(r.kind==='movement'&&r.data.account===body.id)||(r.kind==='arb'&&(r.data.bets?.some((b:any)=>b.account===body.id)||r.data.promo?.account===body.id)));
  if(linked)return Response.json({error:'Esta conta possui movimentações, apostas ou créditos promocionais vinculados. A exclusão foi bloqueada para preservar o histórico. Você pode editar o cadastro da conta.',code:'account_dependency'},{status:409});
  const sql="DELETE FROM records WHERE id=? AND kind='account' AND revision=? AND COALESCE((SELECT group_concat(token, '|') FROM (SELECT id || ':' || revision AS token FROM records ORDER BY id)), '') = ?";
  const result=await database().prepare(sql).bind(body.id,body.revision,recordsSnapshot(rows)).run();
  if(!result.meta.changes)return Response.json({error:'Os dados mudaram. Sincronize e confira a conta antes de excluir.',code:'stale'},{status:409});
  await backupLog({kind:'account',action:'delete',id:body.id,revision:body.revision,summary:summarize('account',old.data),data:old.data,columns:backupColumns('account','delete',old.data,rows)});
  return Response.json({id:body.id,rows:rows.filter((r:any)=>r.id!==body.id)},{headers:{'Cache-Control':'no-store'}});
 }
 if(old?.kind==='commission_person'){
  if(old.revision!==body.revision)return Response.json({error:'Este cadastro mudou. Sincronize antes de excluir.',code:'stale'},{status:409});
  const linked=rows.some((r:any)=>r.kind==='commission_entry'&&r.data.personId===body.id);
  if(linked)return Response.json({error:'Esta pessoa possui comissões, pagamentos ou débitos vinculados. A exclusão foi bloqueada para preservar o histórico.',code:'commission_dependency'},{status:409});
  const sql="DELETE FROM records WHERE id=? AND kind='commission_person' AND revision=? AND COALESCE((SELECT group_concat(token, '|') FROM (SELECT id || ':' || revision AS token FROM records ORDER BY id)), '') = ?";
  const result=await database().prepare(sql).bind(body.id,body.revision,recordsSnapshot(rows)).run();
  if(!result.meta.changes)return Response.json({error:'Os dados mudaram. Sincronize e confira antes de excluir.',code:'stale'},{status:409});
  await backupLog({kind:'commission_person',action:'delete',id:body.id,revision:body.revision,summary:summarize('commission_person',old.data),data:old.data,columns:backupColumns('commission_person','delete',old.data,rows)});
  return Response.json({id:body.id,rows:rows.filter((r:any)=>r.id!==body.id)},{headers:{'Cache-Control':'no-store'}});
 }
 if(!old||old.kind!=='arb')return Response.json({error:'Arbitragem não encontrada. Sincronize os dados.',code:'stale'},{status:404});
 if(old.revision!==body.revision)return Response.json({error:'Esta arbitragem foi alterada em outro dispositivo. Confira a versão atual antes de excluir.',code:'stale'},{status:409});
 const dependents=freebetDependents(rows,body.id);
 if(dependents.length)return Response.json({error:'Esta arbitragem gerou uma freebet usada em '+dependents.map(r=>r.data.event).join(', ')+'. Edite ou exclua primeiro a operação que usa esse crédito.',code:'freebet_dependency'},{status:409});
 const res=await database().prepare(deleteArbitrageSql).bind(body.id,body.revision,recordsSnapshot(rows)).run();
 if(!res.meta.changes)return Response.json({error:'Os dados mudaram em outro dispositivo. Sincronize e confira a arbitragem antes de excluir.',code:'stale'},{status:409});
 await backupLog({kind:'arb',action:'delete',id:body.id,revision:body.revision,summary:summarize('arb',old.data),data:old.data,columns:backupColumns('arb','delete',old.data,rows)});
 return Response.json({id:body.id,rows:rows.filter((r:any)=>r.id!==body.id)},{headers:{'Cache-Control':'no-store'}});
 }catch(e){console.error(e);return Response.json({error:e instanceof z.ZodError?'Confira a arbitragem selecionada.':'Não foi possível excluir. Tente novamente.'},{status:e instanceof z.ZodError?400:503});}}
