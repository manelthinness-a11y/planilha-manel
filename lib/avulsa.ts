import type {RecordItem} from './banca';
// Aba "Entrada avulsa" (menu principal, entre Contas e Arbitragens). Mesma
// mecânica da Camilo: uma entrada por vez, com pessoa, casa e mercado,
// liquidada em Green ou Red direto no saldo real da casa escolhida.
export type AvulsaEntry={event:string;markets:string[];stake:number;odd:number;account:string;house:string;accountId?:string;result:'Pendente'|'Green'|'Red';prize:number;date:string};

export const avulsaEntries=(rows:RecordItem[])=>rows.filter(r=>r.kind==='avulsa').map(r=>({...r,data:r.data as AvulsaEntry}));

export function settleAvulsa(entry:AvulsaEntry,result:'Green'|'Red'):AvulsaEntry{
 if(entry.result!=='Pendente')throw new Error('Esta entrada já foi finalizada. Sincronize os dados.');
 return {...entry,result,prize:result==='Green'?Math.round(entry.stake*entry.odd*100)/100:0};
}

/** Total de entradas avulsas e quantas fecharam Green/Red/seguem Pendente. */
export function avulsaCounts(rows:RecordItem[]){
 const entries=avulsaEntries(rows);
 return {total:entries.length,green:entries.filter(r=>r.data.result==='Green').length,red:entries.filter(r=>r.data.result==='Red').length,pending:entries.filter(r=>r.data.result==='Pendente').length};
}

/** Lucro líquido das entradas avulsas já liquidadas (Green soma prêmio − stake; Red desconta a stake). */
export function avulsaBalance(rows:RecordItem[]):number{
 return avulsaEntries(rows).reduce((sum,r)=>sum+(r.data.result==='Green'?r.data.prize-r.data.stake:r.data.result==='Red'?-r.data.stake:0),0);
}
