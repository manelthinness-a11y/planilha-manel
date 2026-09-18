import type {RecordItem} from './banca';
export type Group='alavancagem'|'individual';
export type Entry={group?:Group;sequence:number;cycle:number;stake:number;prize:number;odd:number;market:string;account:string;house:string;accountId?:string;result:'Pendente'|'Green'|'Red';event:string;date:string};
export const leverageEntries=(rows:RecordItem[],group:Group='alavancagem')=>rows.filter(r=>r.kind==='alavancagem'&&(r.data.group??'alavancagem')===group).map(r=>({...r,data:r.data as Entry})).sort((a,b)=>a.data.sequence-b.data.sequence);
export const defaultLeverageStake=1000;
export const individualDefaultStakeId='individual-default-stake';
export function defaultStakeSettingId(group:Group):string{
 return group==='individual'?individualDefaultStakeId:'alavancagem-default-stake';
}
export function groupDefaultStake(rows:RecordItem[],group:Group):number{
 const row=rows.find(r=>r.kind==='alavancagem_setting'&&r.id===defaultStakeSettingId(group));
 return typeof row?.data?.value==='number'?row.data.value:defaultLeverageStake;
}
/** @deprecated use groupDefaultStake(rows,'individual') */
export const individualDefaultStake=(rows:RecordItem[])=>groupDefaultStake(rows,'individual');
export function resetStakeFor(rows:RecordItem[],group:Group):number{
 return groupDefaultStake(rows,group);
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
/** Net result (cents) of every settled entry in a group: Green adds prize-stake, Red subtracts the stake, Pendente doesn't count yet. */
export function leverageNet(rows:RecordItem[],group:Group='alavancagem'):number{
 return leverageEntries(rows,group).reduce((sum,r)=>sum+(r.data.result==='Green'?r.data.prize-r.data.stake:r.data.result==='Red'?-r.data.stake:0),0);
}
