import type {RecordItem} from './banca';
// Aba "Cassino" (menu principal, antes de Comissões): registros de ganho ou
// perda por pessoa e casa. Ganho soma no saldo real da conta escolhida e
// perda desconta (ver lib/banca.ts).
export type CassinoEntry={type:'Ganho'|'Perda';amount:number;account:string;house:string;accountId?:string;date:string;note:string};

export const cassinoEntries=(rows:RecordItem[])=>rows.filter(r=>r.kind==='cassino').map(r=>({...r,data:r.data as CassinoEntry}));

/** Sinal do registro em centavos: ganho positivo, perda negativa. */
export const cassinoSigned=(e:CassinoEntry)=>e.type==='Ganho'?e.amount:-e.amount;

/** Os três visores da aba: ganhos, perdas e saldo (ganhos − perdas). */
export function cassinoTotals(rows:RecordItem[]){
 const entries=cassinoEntries(rows);
 const gains=entries.filter(r=>r.data.type==='Ganho');
 const losses=entries.filter(r=>r.data.type==='Perda');
 const gainTotal=gains.reduce((sum,r)=>sum+r.data.amount,0);
 const lossTotal=losses.reduce((sum,r)=>sum+r.data.amount,0);
 return {gains:gainTotal,losses:lossTotal,balance:gainTotal-lossTotal,gainCount:gains.length,lossCount:losses.length,count:entries.length};
}

/** Totais por pessoa e casa, do maior saldo para o menor. */
export function cassinoByAccount(rows:RecordItem[]){
 const map=new Map<string,{key:string;account:string;house:string;gains:number;losses:number;balance:number;count:number}>();
 for(const r of cassinoEntries(rows)){
  const d=r.data;const key=d.accountId||(d.house+'|'+d.account);
  const item=map.get(key)||{key,account:d.account,house:d.house,gains:0,losses:0,balance:0,count:0};
  if(d.type==='Ganho')item.gains+=d.amount;else item.losses+=d.amount;
  item.balance=item.gains-item.losses;item.count++;
  map.set(key,item);
 }
 return [...map.values()].sort((a,b)=>b.balance-a.balance||a.account.localeCompare(b.account,'pt-BR')||a.house.localeCompare(b.house,'pt-BR'));
}
