import {z} from 'zod';
import {database} from '@/lib/store';
import type {RecordItem} from '@/lib/banca';
import {recordsSnapshot,insertRecordSql,updateRecordSql,deleteAlavancagemSql} from '@/lib/record-changes';
import {nextLeverage,settleLeverage} from '@/lib/alavancagem';
const input=z.discriminatedUnion('action',[
 z.object({action:z.literal('create'),group:z.enum(['alavancagem','individual']).default('alavancagem'),event:z.string().trim().min(1).max(200),date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),odd:z.number().min(1.3).max(1.6),market:z.string().trim().min(1).max(120),account:z.string().trim().min(1).max(120),house:z.string().trim().min(1).max(120),expectedSequence:z.number().int().positive()}),
 z.object({action:z.literal('settle'),group:z.enum(['alavancagem','individual']).default('alavancagem'),id:z.string().min(1),revision:z.number().int().positive(),result:z.enum(['Green','Red'])}),
 z.object({action:z.literal('delete'),group:z.enum(['alavancagem','individual']).default('alavancagem'),id:z.string().min(1),revision:z.number().int().positive()})
]);
export async function POST(req:Request){try{
 const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)return Response.json({error:'Origem inválida'},{status:403});
 const body=input.parse(await req.json());
 const all=await database().prepare('SELECT * FROM records').all();
 const rows:RecordItem[]=all.results.map((r:any)=>({...r,data:JSON.parse(r.data)}));
 const snapshot=recordsSnapshot(rows);
 let result;
 if(body.action==='create'){
  const next=nextLeverage(rows,body.group);
  if(next.sequence!==body.expectedSequence)return Response.json({error:'A sequência mudou. Sincronize antes de registrar.'},{status:409});
  const data={...next,group:body.group,event:body.event,date:body.date,odd:body.odd,market:body.market,account:body.account,house:body.house,result:'Pendente',prize:0};
  result=await database().prepare(insertRecordSql).bind(crypto.randomUUID(),'alavancagem',JSON.stringify(data),snapshot).run();
 }else if(body.action==='settle'){
  const row=rows.find(r=>r.id===body.id&&r.kind==='alavancagem'&&(r.data.group??'alavancagem')===body.group);
  if(!row||row.revision!==body.revision)return Response.json({error:'A entrada mudou. Sincronize antes de finalizar.'},{status:409});
  const data=settleLeverage(row.data,body.result);
  result=await database().prepare(updateRecordSql).bind(JSON.stringify(data),row.id,body.revision,snapshot).run();
 }else{
  const row=rows.find(r=>r.id===body.id&&r.kind==='alavancagem'&&(r.data.group??'alavancagem')===body.group);
  if(!row||row.revision!==body.revision)return Response.json({error:'A entrada mudou. Sincronize antes de excluir.'},{status:409});
  result=await database().prepare(deleteAlavancagemSql).bind(body.id,body.revision,snapshot).run();
 }
 if(!result.meta.changes)return Response.json({error:'Os dados mudaram. Sincronize e confira antes de repetir.'},{status:409});
 return Response.json({ok:true},{headers:{'Cache-Control':'no-store'}});
}catch(e){return Response.json({error:e instanceof z.ZodError?'Confira o evento e a data.':e instanceof Error?e.message:'Não foi possível salvar.'},{status:400});}}
