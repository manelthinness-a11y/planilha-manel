import {z} from 'zod';
import {database} from '@/lib/store';
import {prepareBankOperation} from '@/lib/bank-transactions';
import type {RecordItem} from '@/lib/banca';
import {backupLog} from '@/lib/backup';
import {checkAccess,unauthorized} from '@/lib/auth';

const schema=z.object({type:z.enum(['deposit','withdraw','transfer']),source:z.string().min(1),sourceRevision:z.number().int().positive(),destination:z.string().optional(),destinationRevision:z.number().int().positive().optional(),amount:z.number().int().positive().max(10000000000)});
const brl=(cents:number)=>(cents/100).toFixed(2).replace('.',',');
const bankLabel=(rows:any[],id:string)=>{const a=rows.find((r:any)=>r.kind==='bank'&&r.id===id);return a?a.data.bank+' · '+a.data.holder:id;};
const typeLabel:Record<string,string>={deposit:'Depósito',withdraw:'Saque',transfer:'Transferência'};
export async function POST(req:Request){
 if(!checkAccess(req))return unauthorized();
 const origin=req.headers.get('origin');
 if(origin&&origin!==new URL(req.url).origin)return Response.json({error:'Origem inválida'},{status:403});
 try{
  const op=schema.parse(await req.json());
  const db=database();
  const result=await db.prepare('SELECT * FROM records ORDER BY rowid DESC').all<{id:string;kind:RecordItem['kind'];data:string;revision:number}>();
  const rows=result.results.map(r=>({...r,data:JSON.parse(r.data)}));
  const change=prepareBankOperation(rows,op);
  const saved=await db.prepare(change.sql).bind(...change.bindings).run();
  if(saved.meta.changes!==change.count)return Response.json({error:'Os saldos mudaram em outro dispositivo. Feche esta janela e sincronize antes de tentar novamente.'},{status:409});
  const columns:[string,string|number][]=[['Ação',typeLabel[op.type]],['Banco origem',bankLabel(rows,op.source)]];
  if(op.destination)columns.push(['Banco destino',bankLabel(rows,op.destination)]);
  columns.push(['Valor (R$)',brl(op.amount)]);
  await backupLog({kind:'bank_transaction',action:op.type,summary:op.type+' · R$ '+(op.amount/100).toFixed(2).replace('.',',')+(op.destination?' · '+op.source+' → '+op.destination:' · '+op.source),data:op,columns});
  return Response.json({ok:true},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return Response.json({error:e instanceof z.ZodError?'Confira o valor e os bancos selecionados.':e instanceof Error?e.message:'Não foi possível registrar a operação.'},{status:400});}
}
