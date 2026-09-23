import {z} from 'zod';
import {database} from '@/lib/store';
import type {RecordItem} from '@/lib/banca';
import {recordsSnapshot,insertRecordSql,updateRecordSql,deleteAlavancagemSql} from '@/lib/record-changes';
import {nextLeverage,settleLeverage,groupDefaultStake,defaultStakeSettingId,mirrorGroupOf,TRACKS,type Group} from '@/lib/alavancagem';
import {backupLog} from '@/lib/backup';
import {checkAccess,unauthorized} from '@/lib/auth';
import {alertAlavancagemRed,alertAlavancagemCycleComplete} from '@/lib/alerts';
const brl=(cents:number)=>(cents/100).toFixed(2).replace('.',',');
const entryColumns=(acao:string,data:any):[string,string|number][]=>[['Ação',acao],['Sequência',data.sequence],['Ciclo',data.cycle],['Evento',data.event],['Mercado',data.market],['Data',data.date],['Odd',data.odd],['Conta',data.account],['Casa',data.house],['Stake (R$)',brl(data.stake)],['Resultado',data.result],['Prêmio (R$)',brl(data.prize)]];
const groupEnum=z.enum(['alavancagem','individual','alavancagem2','individual2']) as z.ZodType<Group>;
const input=z.discriminatedUnion('action',[
 z.object({action:z.literal('create'),group:groupEnum.default('alavancagem'),event:z.string().trim().min(1).max(200),date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),odd:z.number().min(1.01).max(5),market:z.string().trim().min(1).max(120),account:z.string().trim().min(1).max(120),house:z.string().trim().min(1).max(120),accountId:z.string().trim().min(1),expectedSequence:z.number().int().positive()}),
 z.object({action:z.literal('settle'),group:groupEnum.default('alavancagem'),id:z.string().min(1),revision:z.number().int().positive(),result:z.enum(['Green','Red'])}),
 z.object({action:z.literal('delete'),group:groupEnum.default('alavancagem'),id:z.string().min(1),revision:z.number().int().positive()}),
 z.object({action:z.literal('set-default-stake'),group:groupEnum.default('alavancagem'),value:z.number().int().min(100).max(1000000)})
]);
export async function POST(req:Request){if(!checkAccess(req))return unauthorized();try{
 const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)return Response.json({error:'Origem inválida'},{status:403});
 const body=input.parse(await req.json());
 const all=await database().prepare('SELECT * FROM records').all();
 const rows:RecordItem[]=all.results.map((r:any)=>({...r,data:JSON.parse(r.data)}));
 const snapshot=recordsSnapshot(rows);
 let result;
 let logEvent:{kind:string;action:string;id?:string;revision?:number;summary?:string;data?:unknown;columns?:[string,string|number][]}|null=null;
 let alertAfter:(()=>Promise<void>)|null=null;
 if(body.action==='create'){
  const track=TRACKS.find(t=>t.mainGroup===body.group||t.individualGroup===body.group);
  if(track&&(body.odd<track.oddMin||body.odd>track.oddMax))return Response.json({error:`A odd deve estar entre ${track.oddMin.toFixed(2)} e ${track.oddMax.toFixed(2)} nesta aba.`},{status:400});
  const next=nextLeverage(rows,body.group);
  if(next.sequence!==body.expectedSequence)return Response.json({error:'A sequência mudou. Sincronize antes de registrar.'},{status:409});
  const mirrorGroup=mirrorGroupOf(body.group);
  let mirrorNext:{stake:number;sequence:number;cycle:number}|null=null;
  if(mirrorGroup){
   try{mirrorNext=nextLeverage(rows,mirrorGroup);}
   catch{return Response.json({error:'A aba Individual correspondente possui uma entrada pendente. Finalize-a antes de registrar uma nova entrada aqui.'},{status:409});}
  }
  const id=crypto.randomUUID();
  const data={...next,group:body.group,event:body.event,date:body.date,odd:body.odd,market:body.market,account:body.account,house:body.house,accountId:body.accountId,result:'Pendente',prize:0};
  result=await database().prepare(insertRecordSql).bind(id,'alavancagem',JSON.stringify(data),snapshot).run();
  if(!result.meta.changes)return Response.json({error:'Os dados mudaram. Sincronize e confira antes de repetir.'},{status:409});
  await backupLog({kind:'alavancagem',action:'create',id,revision:1,summary:body.group+' · entrada '+data.sequence+' · '+data.event,data,columns:entryColumns('Cadastro',data)});
  if(mirrorGroup&&mirrorNext){
   const rowsAfter=[...rows,{id,kind:'alavancagem',data,revision:1}];
   const snapshotAfter=recordsSnapshot(rowsAfter);
   const mirrorData={...mirrorNext,stake:groupDefaultStake(rowsAfter,mirrorGroup),group:mirrorGroup,event:body.event,date:body.date,odd:body.odd,market:body.market,account:body.account,house:body.house,accountId:body.accountId,result:'Pendente',prize:0};
   const mirrorId=crypto.randomUUID();
   const mirrorResult=await database().prepare(insertRecordSql).bind(mirrorId,'alavancagem',JSON.stringify(mirrorData),snapshotAfter).run();
   if(!mirrorResult.meta.changes)return Response.json({error:'A entrada foi registrada, mas não foi possível espelhar automaticamente na Individual correspondente. Sincronize e registre manualmente.'},{status:409});
   await backupLog({kind:'alavancagem',action:'create',id:mirrorId,revision:1,summary:mirrorGroup+' · entrada espelhada '+mirrorData.sequence+' · '+mirrorData.event,data:mirrorData,columns:entryColumns('Cadastro (espelhado)',mirrorData)});
  }
  return Response.json({ok:true},{headers:{'Cache-Control':'no-store'}});
 }else if(body.action==='settle'){
  const row=rows.find(r=>r.id===body.id&&r.kind==='alavancagem'&&(r.data.group??'alavancagem')===body.group);
  if(!row||row.revision!==body.revision)return Response.json({error:'A entrada mudou. Sincronize antes de finalizar.'},{status:409});
  const data=settleLeverage(row.data,body.result);
  result=await database().prepare(updateRecordSql).bind(JSON.stringify(data),row.id,body.revision,snapshot).run();
  logEvent={kind:'alavancagem',action:'settle',id:row.id,revision:body.revision+1,summary:body.group+' · '+body.result+' · '+data.event,data,columns:entryColumns('Liquidação',data)};
  // Alerta só no que "fecha capítulo": quebrou (Red) ou bateu a meta do ciclo (Green com prêmio >= R$ 50,00). Green parcial (ciclo continua) não avisa.
  const track=TRACKS.find(tr=>tr.mainGroup===body.group||tr.individualGroup===body.group);
  const trackLabel=track?track.label+(body.group===track.individualGroup?' · Individual':''):body.group;
  if(body.result==='Red')alertAfter=()=>alertAlavancagemRed(trackLabel,data.event);
  else if(body.result==='Green'&&data.prize>=5000)alertAfter=()=>alertAlavancagemCycleComplete(trackLabel,data.event,data.prize);
 }else if(body.action==='delete'){
  const row=rows.find(r=>r.id===body.id&&r.kind==='alavancagem'&&(r.data.group??'alavancagem')===body.group);
  if(!row||row.revision!==body.revision)return Response.json({error:'A entrada mudou. Sincronize antes de excluir.'},{status:409});
  result=await database().prepare(deleteAlavancagemSql).bind(body.id,body.revision,snapshot).run();
  logEvent={kind:'alavancagem',action:'delete',id:row.id,revision:body.revision,summary:body.group+' · exclusão · '+row.data.event,data:row.data,columns:entryColumns('Exclusão',row.data)};
 }else{
  const settingId=defaultStakeSettingId(body.group);
  const row=rows.find(r=>r.kind==='alavancagem_setting'&&r.id===settingId);
  const data={value:body.value,group:body.group};
  result=row
   ?await database().prepare(updateRecordSql).bind(JSON.stringify(data),row.id,row.revision,snapshot).run()
   :await database().prepare(insertRecordSql).bind(settingId,'alavancagem_setting',JSON.stringify(data),snapshot).run();
  logEvent={kind:'alavancagem_setting',action:row?'update':'create',id:settingId,revision:(row?.revision||0)+1,summary:'Nova stake padrão ('+body.group+'): R$ '+(body.value/100).toFixed(2).replace('.',','),data,columns:[['Ação','Nova stake padrão'],['Valor (R$)',brl(body.value)]]};
 }
 if(!result.meta.changes)return Response.json({error:'Os dados mudaram. Sincronize e confira antes de repetir.'},{status:409});
 if(logEvent)await backupLog(logEvent);
 if(alertAfter)await alertAfter();
 return Response.json({ok:true},{headers:{'Cache-Control':'no-store'}});
}catch(e){return Response.json({error:e instanceof z.ZodError?'Confira o evento e a data.':e instanceof Error?e.message:'Não foi possível salvar.'},{status:400});}}
