import type {RecordItem} from './banca';
export type CamiloEntry={event:string;markets:string[];stake:number;odd:number;account:string;house:string;accountId?:string;result:'Pendente'|'Green'|'Red';prize:number;date:string};

export const camiloEntries=(rows:RecordItem[])=>rows.filter(r=>r.kind==='camilo').map(r=>({...r,data:r.data as CamiloEntry}));

export function settleCamilo(entry:CamiloEntry,result:'Green'|'Red'):CamiloEntry{
 if(entry.result!=='Pendente')throw new Error('Esta entrada já foi finalizada. Sincronize os dados.');
 return {...entry,result,prize:result==='Green'?Math.round(entry.stake*entry.odd*100)/100:0};
}

/** Total de entradas e quantas fecharam Green/Red/seguem Pendente. */
export function camiloCounts(rows:RecordItem[]){
 const entries=camiloEntries(rows);
 return {total:entries.length,green:entries.filter(r=>r.data.result==='Green').length,red:entries.filter(r=>r.data.result==='Red').length,pending:entries.filter(r=>r.data.result==='Pendente').length};
}
