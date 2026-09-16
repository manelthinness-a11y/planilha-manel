import type {RecordItem} from './banca';
import {recordsSnapshot} from './record-changes';

export type BankOperation={type:'deposit'|'withdraw'|'transfer';source:string;sourceRevision:number;destination?:string;destinationRevision?:number;amount:number};
const limit=10000000000;
export function prepareBankOperation(rows:RecordItem[],op:BankOperation){
 if(!['deposit','withdraw','transfer'].includes(op.type)||!Number.isSafeInteger(op.amount)||op.amount<=0||op.amount>limit)throw new Error('Informe um valor positivo válido.');
 const source=rows.find(r=>r.id===op.source&&r.kind==='bank');
 if(!source||source.revision!==op.sourceRevision)throw new Error('O banco de origem mudou. Feche esta janela e sincronize os dados.');
 if(op.type!=='deposit'&&source.data.balance<op.amount)throw new Error('Saldo insuficiente no banco de origem.');
 const changes=[{...source,data:{...source.data,balance:source.data.balance+(op.type==='deposit'?op.amount:-op.amount)}}];
 if(op.type==='transfer'){
  if(op.destination===op.source)throw new Error('Escolha um banco de destino diferente.');
  const destination=rows.find(r=>r.id===op.destination&&r.kind==='bank');
  if(!destination||destination.revision!==op.destinationRevision)throw new Error('O banco de destino mudou. Feche esta janela e sincronize os dados.');
  changes.push({...destination,data:{...destination.data,balance:destination.data.balance+op.amount}});
 }
 if(changes.some(r=>!Number.isSafeInteger(r.data.balance)||Math.abs(r.data.balance)>limit))throw new Error('O saldo resultante ultrapassa o limite permitido.');
 // One UPDATE changes both balances or neither. The uncorrelated snapshot
 // subquery is evaluated once, before the statement changes any row.
 const sql=`UPDATE records SET data=CASE id ${changes.map(()=> 'WHEN ? THEN ?').join(' ')} ELSE data END, revision=revision+1 WHERE id IN (${changes.map(()=>'?').join(',')}) AND COALESCE((SELECT group_concat(token,'|') FROM (SELECT id || ':' || revision AS token FROM records ORDER BY id)),'')=?`;
 const bindings=changes.flatMap(r=>[r.id,JSON.stringify(r.data)]).concat(changes.map(r=>r.id),[recordsSnapshot(rows)]);
 return {sql,bindings,count:changes.length};
}
