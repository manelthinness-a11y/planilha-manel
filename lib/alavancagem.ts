import type {RecordItem} from './banca';
export type Group='alavancagem'|'individual';
export type Entry={group?:Group;sequence:number;cycle:number;stake:number;prize:number;odd:number;market:string;account:string;house:string;result:'Pendente'|'Green'|'Red';event:string;date:string};
export const leverageEntries=(rows:RecordItem[],group:Group='alavancagem')=>rows.filter(r=>r.kind==='alavancagem'&&(r.data.group??'alavancagem')===group).map(r=>({...r,data:r.data as Entry})).sort((a,b)=>a.data.sequence-b.data.sequence);
export const individualDefaultStakeId='individual-default-stake';
export const defaultIndividualStake=1000;
export function individualDefaultStake(rows:RecordItem[]):number{
 const row=rows.find(r=>r.kind==='alavancagem_setting'&&r.id===individualDefaultStakeId);
 return typeof row?.data?.value==='number'?row.data.value:defaultIndividualStake;
}
export function resetStakeFor(rows:RecordItem[],group:Group):number{
 return group==='individual'?individualDefaultStake(rows):1000;
}
export function nextLeverage(rows:RecordItem[],group:Group='alavancagem'){
 const entries=leverageEntries(rows,group),last=entries.at(-1);
 if(last?.data.result==='Pendente')throw new Error('Finalize a entrada pendente antes de criar outra.');
 const reset=!last||last.data.result==='Red'||last.data.prize>=5000;
 return {stake:reset?resetStakeFor(rows,group):last.data.prize,sequence:(last?.data.sequence||0)+1,cycle:!last?1:last.data.cycle+(reset?1:0)};
}
export function settleLeverage(entry:Entry,result:'Green'|'Red'):Entry{
 if(entry.result!=='Pendente')throw new Error('Esta entrada já foi finalizada. Sincronize os dados.');
 return {...entry,result,prize:result==='Green'?Math.round(entry.stake*entry.odd*100)/100:0};
}
