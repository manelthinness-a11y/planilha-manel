import type {RecordItem} from './banca';
export type Odd5Entry={event:string;markets:string[];stake:number;odd:number;account:string;house:string;accountId?:string;result:'Pendente'|'Green'|'Red';prize:number;date?:string};
export const odd5DefaultStakeId='odd5-default-stake';
export const defaultOdd5Stake=500;
export const odd5OddDefault='5.00';

export const odd5Entries=(rows:RecordItem[])=>rows.filter(r=>r.kind==='odd5').map(r=>({...r,data:r.data as Odd5Entry}));

export function odd5DefaultStake(rows:RecordItem[]):number{
 const row=rows.find(r=>r.kind==='odd5_setting'&&r.id===odd5DefaultStakeId);
 return typeof row?.data?.value==='number'?row.data.value:defaultOdd5Stake;
}

export function settleOdd5(entry:Odd5Entry,result:'Green'|'Red'):Odd5Entry{
 if(entry.result!=='Pendente')throw new Error('Esta entrada já foi finalizada. Sincronize os dados.');
 return {...entry,result,prize:result==='Green'?Math.round(entry.stake*entry.odd*100)/100:0};
}

/** Net result (cents) of every settled entry: Green adds prize-stake, Red subtracts the stake, Pendente doesn't count yet. */
export function odd5Balance(rows:RecordItem[]):number{
 return odd5Entries(rows).reduce((sum,r)=>sum+(r.data.result==='Green'?r.data.prize-r.data.stake:r.data.result==='Red'?-r.data.stake:0),0);
}

export function odd5Counts(rows:RecordItem[]){
 const entries=odd5Entries(rows);
 return {total:entries.length,green:entries.filter(r=>r.data.result==='Green').length,red:entries.filter(r=>r.data.result==='Red').length,pending:entries.filter(r=>r.data.result==='Pendente').length};
}
