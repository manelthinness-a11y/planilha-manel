import type {RecordItem} from './banca';
export type Group='alavancagem'|'individual';
export type Entry={group?:Group;sequence:number;cycle:number;stake:number;prize:number;result:'Pendente'|'Green'|'Red';event:string;date:string};
export const leverageEntries=(rows:RecordItem[],group:Group='alavancagem')=>rows.filter(r=>r.kind==='alavancagem'&&(r.data.group??'alavancagem')===group).map(r=>({...r,data:r.data as Entry})).sort((a,b)=>a.data.sequence-b.data.sequence);
export function nextLeverage(rows:RecordItem[],group:Group='alavancagem'){
 const entries=leverageEntries(rows,group),last=entries.at(-1);
 if(last?.data.result==='Pendente')throw new Error('Finalize a entrada pendente antes de criar outra.');
 const reset=!last||last.data.result==='Red'||last.data.prize>5000;
 return {stake:reset?1000:last.data.prize,sequence:(last?.data.sequence||0)+1,cycle:!last?1:last.data.cycle+(reset?1:0)};
}
export function settleLeverage(entry:Entry,result:'Green'|'Red'):Entry{
 if(entry.result!=='Pendente')throw new Error('Esta entrada já foi finalizada. Sincronize os dados.');
 return {...entry,result,prize:result==='Green'?Math.round(entry.stake*130/100):0};
}
