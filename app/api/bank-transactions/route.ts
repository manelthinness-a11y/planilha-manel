import {z} from 'zod';
import {database} from '@/lib/store';
import {prepareBankOperation} from '@/lib/bank-transactions';
import type {RecordItem} from '@/lib/banca';

const schema=z.object({type:z.enum(['deposit','withdraw','transfer']),source:z.string().min(1),sourceRevision:z.number().int().positive(),destination:z.string().optional(),destinationRevision:z.number().int().positive().optional(),amount:z.number().int().positive().max(10000000000)});
export async function POST(req:Request){
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
  return Response.json({ok:true},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return Response.json({error:e instanceof z.ZodError?'Confira o valor e os bancos selecionados.':e instanceof Error?e.message:'Não foi possível registrar a operação.'},{status:400});}
}
