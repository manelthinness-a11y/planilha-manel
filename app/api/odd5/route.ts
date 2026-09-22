import {z} from 'zod';
import {database} from '@/lib/store';
import type {RecordItem} from '@/lib/banca';
import {recordsSnapshot,insertRecordSql,updateRecordSql,deleteOdd5Sql} from '@/lib/record-changes';
import {settleOdd5,odd5DefaultStakeId} from '@/lib/odd5';
import {backupLog} from '@/lib/backup';
import {checkAccess,unauthorized} from '@/lib/auth';
const brl=(cents:number)=>(cents/100).toFixed(2).replace('.',',');
const entryColumns=(acao:string,data:any):[string,string|number][]=>[['Ação',acao],['Evento',data.event],['Mercado(s)',(data.markets||[]).join(' | ')],['Odd',data.odd],['Conta',data.account],['Casa',data.house],['Stake (R$)',brl(data.stake)],['Resultado',data.result],['Prêmio (R$)',brl(data.prize)]];
const str=z.string().trim().min(1).max(200);
const input=z.discriminatedUnion('action',[
 z.object({action:z.literal('create'),event:str,markets:z.array(str).min(1).max(20),odd:z.number().min(1.01).max(1000),stake:z.number().int().positive().max(10000000000),accountId:z.string().trim().min(1)}),
 z.object({action:z.literal('edit'),id:z.string().min(1),revision:z.number().int().positive(),event:str,markets:z.array(str).min(1).max(20),odd:z.number().min(1.01).max(1000),stake:z.number().int().positive().max(10000000000),accountId:z.string().trim().min(1)}),
 z.object({action:z.literal('settle'),id:z.string().min(1),revision:z.number().int().positive(),result:z.enum(['Green','Red'])}),
 z.object({action:z.literal('delete'),id:z.string().min(1),revision:z.number().int().positive()}),
 z.object({action:z.literal('set-default-stake'),value:z.number().int().min(100).max(1000000)})
]);
export async function POST(req:Request){if(!checkAccess(req))return unauthorized();try{
 const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)return Response.json({error:'Origem inválida'},{status:403});
 const body=input.parse(await req.json());
 const all=await database().prepare('SELECT * FROM records').all();
 const rows:RecordItem[]=all.results.map((r:any)=>({...r,data:JSON.parse(r.data)}));
 const snapshot=recordsSnapshot(rows);
 let result;
 let logEvent:{kind:string;action:string;id?:string;revision?:number;summary?:string;data?:unknown;columns?:[string,string|number][]}|null=null;
 if(body.action==='create'){
  const accountRow=rows.find(r=>r.kind==='account'&&r.id===body.accountId);
  if(!accountRow)return Response.json({error:'Selecione uma conta válida.'},{status:400});
  const id=crypto.randomUUID();
  const data={event:body.event,markets:body.markets,odd:body.odd,stake:body.stake,account:accountRow.data.holder,house:accountRow.data.house,accountId:body.accountId,result:'Pendente',prize:0};
  result=await database().prepare(insertRecordSql).bind(id,'odd5',JSON.stringify(data),snapshot).run();
  if(!result.meta.changes)return Response.json({error:'Os dados mudaram. Sincronize e tente novamente.'},{status:409});
  await backupLog({kind:'odd5',action:'create',id,revision:1,summary:'ODD 5 · '+data.event,data,columns:entryColumns('Cadastro',data)});
  return Response.json({ok:true},{headers:{'Cache-Control':'no-store'}});
 }else if(body.action==='edit'){
  const row=rows.find(r=>r.id===body.id&&r.kind==='odd5');
  if(!row||row.revision!==body.revision)return Response.json({error:'A entrada mudou. Sincronize antes de editar.'},{status:409});
  const accountRow=rows.find(r=>r.kind==='account'&&r.id===body.accountId);
  if(!accountRow)return Response.json({error:'Selecione uma conta válida.'},{status:400});
  const data:any={...row.data,event:body.event,markets:body.markets,odd:body.odd,stake:body.stake,account:accountRow.data.holder,house:accountRow.data.house,accountId:body.accountId};
  if(data.result!=='Pendente')data.prize=data.result==='Green'?Math.round(data.stake*data.odd*100)/100:0;
  result=await database().prepare(updateRecordSql).bind(JSON.stringify(data),row.id,body.revision,snapshot).run();
  logEvent={kind:'odd5',action:'update',id:row.id,revision:body.revision+1,summary:'ODD 5 · edição · '+data.event,data,columns:entryColumns('Atualização',data)};
 }else if(body.action==='settle'){
  const row=rows.find(r=>r.id===body.id&&r.kind==='odd5');
  if(!row||row.revision!==body.revision)return Response.json({error:'A entrada mudou. Sincronize antes de finalizar.'},{status:409});
  const data=settleOdd5(row.data,body.result);
  result=await database().prepare(updateRecordSql).bind(JSON.stringify(data),row.id,body.revision,snapshot).run();
  logEvent={kind:'odd5',action:'settle',id:row.id,revision:body.revision+1,summary:'ODD 5 · '+body.result+' · '+data.event,data,columns:entryColumns('Liquidação',data)};
 }else if(body.action==='delete'){
  const row=rows.find(r=>r.id===body.id&&r.kind==='odd5');
  if(!row||row.revision!==body.revision)return Response.json({error:'A entrada mudou. Sincronize antes de excluir.'},{status:409});
  result=await database().prepare(deleteOdd5Sql).bind(body.id,body.revision,snapshot).run();
  logEvent={kind:'odd5',action:'delete',id:row.id,revision:body.revision,summary:'ODD 5 · exclusão · '+row.data.event,data:row.data,columns:entryColumns('Exclusão',row.data)};
 }else{
  const row=rows.find(r=>r.kind==='odd5_setting'&&r.id===odd5DefaultStakeId);
  const data={value:body.value};
  result=row
   ?await database().prepare(updateRecordSql).bind(JSON.stringify(data),row.id,row.revision,snapshot).run()
   :await database().prepare(insertRecordSql).bind(odd5DefaultStakeId,'odd5_setting',JSON.stringify(data),snapshot).run();
  logEvent={kind:'odd5_setting',action:row?'update':'create',id:odd5DefaultStakeId,revision:(row?.revision||0)+1,summary:'ODD 5 · nova stake padrão: R$ '+(body.value/100).toFixed(2).replace('.',','),data,columns:[['Ação','Nova stake padrão'],['Valor (R$)',brl(body.value)]]};
 }
 if(!result.meta.changes)return Response.json({error:'Os dados mudaram. Sincronize e confira antes de repetir.'},{status:409});
 if(logEvent)await backupLog(logEvent);
 return Response.json({ok:true},{headers:{'Cache-Control':'no-store'}});
}catch(e){return Response.json({error:e instanceof z.ZodError?'Confira o evento e os valores.':e instanceof Error?e.message:'Não foi possível salvar.'},{status:400});}}
