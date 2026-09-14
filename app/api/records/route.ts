import {database} from '@/lib/store';
import {z} from 'zod';
import {summary,grantsOf} from '@/lib/banca';
import {combinationLabel} from '@/lib/markets';
import {recordsSnapshot,insertRecordSql,updateRecordSql,deleteArbitrageSql,freebetDependents} from '@/lib/record-changes';
import {bankNameKey} from '@/lib/banks';
const cents=z.number().int().min(0).max(10000000000), str=z.string().trim().min(1).max(200);
const bet=z.object({id:str,groupId:str.optional(),account:str,selection:z.string().trim().min(1).max(5000),combination:z.array(z.object({market:str,selection:str})).max(12).optional(),capital:z.enum(['Real','Freebet']),lot:z.string().optional(),previousLoss:cents.optional(),stake:cents.positive(),odd:z.number().min(1).max(10000),status:z.enum(['Pendente','Ganhou','Perdeu','Cancelada','Cashout']),returned:cents,reissued:z.boolean().optional()});
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const bankSchema=z.object({bank:str.transform(v=>v.replace(/\s+/g,' ')),holder:str.transform(v=>v.replace(/\s+/g,' ')),balance:z.number().int().min(-10000000000).max(10000000000),note:z.string().max(1000).default('')});
const promo=z.object({account:str,expected:cents.positive(),status:z.enum(['Aguardando','Recebida','Não recebida']),received:cents.default(0),receivedDate:z.union([date,z.literal('')]).default(''),expires:z.union([date,z.literal('')]).default(''),condition:z.string().max(1000).default(''),lossPct:z.number().min(0).max(100).nullable().default(null)}).superRefine((p,c)=>{if(p.status==='Recebida'&&(!p.received||!p.receivedDate))c.addIssue({code:z.ZodIssueCode.custom,message:'Informe o valor e a data de recebimento'});if(p.status==='Recebida'&&p.expires&&p.expires<p.receivedDate)c.addIssue({code:z.ZodIssueCode.custom,message:'Vencimento anterior ao recebimento'});});
const schemas={bank:bankSchema,account:z.object({house:str,holder:str,initial:cents,note:z.string().max(1000).default('')}),movement:z.object({account:str,type:z.enum(['Depósito','Saque','Ajuste positivo','Ajuste negativo','Freebet recebida']),amount:cents.positive(),date:str,expires:z.string().optional(),note:z.string().max(1000).default('')}),arb:z.object({event:str,market:str,date:str,note:z.string().max(1000).default(''),bets:z.array(bet).min(2).max(60),promo:promo.nullable().optional()})};
async function all(){const r=await database().prepare('SELECT * FROM records ORDER BY rowid DESC').all();return r.results.map((r:any)=>({...r,data:JSON.parse(r.data)}));}
export async function GET(){try{return Response.json({rows:await all()},{headers:{'Cache-Control':'no-store, max-age=0'}});}catch(e){console.error(e);return Response.json({error:'Não foi possível carregar os dados. Tente novamente.'},{status:503});}}
export async function POST(req:Request){try{
 const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)return Response.json({error:'Origem inválida'},{status:403});
 const body=z.object({kind:z.enum(["account","movement","arb","bank"]),data:z.unknown(),id:z.string().optional(),revision:z.number().int().optional()}).parse(await req.json());if(!Object.hasOwn(schemas,body.kind))throw new Error('Registro inválido');
 const data:any=schemas[body.kind as keyof typeof schemas].parse(body.data);const rows=await all();const old=body.id?rows.find((r:any)=>r.id===body.id):null;
 if(body.id&&(!old||old.kind!==body.kind))throw new Error('Registro não encontrado');
 if(old&&old.revision!==body.revision)return Response.json({error:'Este registro mudou em outro dispositivo. Atualize antes de editar.',code:'stale'},{status:409});
 if(body.kind==='bank'&&rows.some((r:any)=>r.kind==='bank'&&r.id!==body.id&&bankNameKey(r.data.bank)===bankNameKey(data.bank)&&bankNameKey(r.data.holder)===bankNameKey(data.holder)))return Response.json({error:'Este banco já está cadastrado para essa pessoa. Edite o banco existente para atualizar o saldo.'},{status:400});
 if(body.kind==='account'&&rows.some((r:any)=>r.kind==='account'&&r.id!==body.id&&r.data.house.toLowerCase()===data.house?.toLowerCase()&&r.data.holder.toLowerCase()===data.holder?.toLowerCase()))throw new Error('Essa casa e titular já estão cadastrados');
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
 const snapshot=recordsSnapshot(rows);
 const res=old?await database().prepare(updateRecordSql).bind(JSON.stringify(data),id,body.revision,snapshot).run():await database().prepare(insertRecordSql).bind(id,body.kind,JSON.stringify(data),snapshot).run();
 if(!res.meta.changes)return Response.json({error:'Os dados mudaram em outro dispositivo. Sincronize e confira o registro antes de salvar novamente.',code:'stale'},{status:409});
 const saved={id,kind:body.kind,data,revision:old?old.revision+1:1};
 return Response.json({id,rows:[saved,...rows.filter((r:any)=>r.id!==id)]},{headers:{'Cache-Control':'no-store'}});
 }catch(e){console.error(e);return Response.json({error:e instanceof z.ZodError?'Confira os campos obrigatórios e valores.':e instanceof Error?e.message:'Não foi possível salvar.'},{status:400});}}

export async function DELETE(req:Request){try{
 const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)return Response.json({error:'Origem inválida'},{status:403});
 const body=z.object({id:z.string().min(1),revision:z.number().int().positive()}).parse(await req.json());
 const rows=await all();const old=rows.find((r:any)=>r.id===body.id);
 if(!old||old.kind!=='arb')return Response.json({error:'Arbitragem não encontrada. Sincronize os dados.',code:'stale'},{status:404});
 if(old.revision!==body.revision)return Response.json({error:'Esta arbitragem foi alterada em outro dispositivo. Confira a versão atual antes de excluir.',code:'stale'},{status:409});
 const dependents=freebetDependents(rows,body.id);
 if(dependents.length)return Response.json({error:'Esta arbitragem gerou uma freebet usada em '+dependents.map(r=>r.data.event).join(', ')+'. Edite ou exclua primeiro a operação que usa esse crédito.',code:'freebet_dependency'},{status:409});
 const res=await database().prepare(deleteArbitrageSql).bind(body.id,body.revision,recordsSnapshot(rows)).run();
 if(!res.meta.changes)return Response.json({error:'Os dados mudaram em outro dispositivo. Sincronize e confira a arbitragem antes de excluir.',code:'stale'},{status:409});
 return Response.json({id:body.id,rows:rows.filter((r:any)=>r.id!==body.id)},{headers:{'Cache-Control':'no-store'}});
 }catch(e){console.error(e);return Response.json({error:e instanceof z.ZodError?'Confira a arbitragem selecionada.':'Não foi possível excluir. Tente novamente.'},{status:e instanceof z.ZodError?400:503});}}
