import {z} from 'zod';
import {database} from '@/lib/store';
import type {RecordItem} from '@/lib/banca';
import {recordsSnapshot,insertRecordSql,updateRecordSql,deleteCassinoSql} from '@/lib/record-changes';
import {backupLog} from '@/lib/backup';
import {checkAccess,unauthorized} from '@/lib/auth';
const brl=(cents:number)=>(cents/100).toFixed(2).replace('.',',');
const entryColumns=(acao:string,data:any):[string,string|number][]=>[['Ação',acao],['Tipo',data.type],['Valor (R$)',brl(data.amount)],['Conta',data.account],['Casa',data.house],['Data',data.date||''],['Observação',data.note||'']];
const dateStr=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const fields={type:z.enum(['Ganho','Perda']),amount:z.number().int().positive().max(10000000000),accountId:z.string().trim().min(1),date:dateStr,note:z.string().trim().max(300).default('')};
const input=z.discriminatedUnion('action',[
 z.object({action:z.literal('create'),...fields}),
 z.object({action:z.literal('edit'),id:z.string().min(1),revision:z.number().int().positive(),...fields}),
 z.object({action:z.literal('delete'),id:z.string().min(1),revision:z.number().int().positive()})
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
  const data={type:body.type,amount:body.amount,account:accountRow.data.holder,house:accountRow.data.house,accountId:body.accountId,date:body.date,note:body.note};
  result=await database().prepare(insertRecordSql).bind(id,'cassino',JSON.stringify(data),snapshot).run();
  if(!result.meta.changes)return Response.json({error:'Os dados mudaram. Sincronize e tente novamente.'},{status:409});
  await backupLog({kind:'cassino',action:'create',id,revision:1,summary:'Cassino · '+data.type+' · R$ '+brl(data.amount)+' · '+data.house+' · '+data.account,data,columns:entryColumns('Cadastro',data)});
  return Response.json({ok:true},{headers:{'Cache-Control':'no-store'}});
 }else if(body.action==='edit'){
  const row=rows.find(r=>r.id===body.id&&r.kind==='cassino');
  if(!row||row.revision!==body.revision)return Response.json({error:'O registro mudou. Sincronize antes de editar.'},{status:409});
  const accountRow=rows.find(r=>r.kind==='account'&&r.id===body.accountId);
  if(!accountRow)return Response.json({error:'Selecione uma conta válida.'},{status:400});
  const data={...row.data,type:body.type,amount:body.amount,account:accountRow.data.holder,house:accountRow.data.house,accountId:body.accountId,date:body.date,note:body.note};
  result=await database().prepare(updateRecordSql).bind(JSON.stringify(data),row.id,body.revision,snapshot).run();
  logEvent={kind:'cassino',action:'update',id:row.id,revision:body.revision+1,summary:'Cassino · edição · '+data.type+' · R$ '+brl(data.amount),data,columns:entryColumns('Atualização',data)};
 }else{
  const row=rows.find(r=>r.id===body.id&&r.kind==='cassino');
  if(!row||row.revision!==body.revision)return Response.json({error:'O registro mudou. Sincronize antes de excluir.'},{status:409});
  result=await database().prepare(deleteCassinoSql).bind(body.id,body.revision,snapshot).run();
  logEvent={kind:'cassino',action:'delete',id:row.id,revision:body.revision,summary:'Cassino · exclusão · '+row.data.type+' · R$ '+brl(row.data.amount),data:row.data,columns:entryColumns('Exclusão',row.data)};
 }
 if(!result.meta.changes)return Response.json({error:'Os dados mudaram. Sincronize e confira antes de repetir.'},{status:409});
 if(logEvent)await backupLog(logEvent);
 return Response.json({ok:true},{headers:{'Cache-Control':'no-store'}});
}catch(e){return Response.json({error:e instanceof z.ZodError?'Confira o tipo, o valor e a data.':e instanceof Error?e.message:'Não foi possível salvar.'},{status:400});}}
