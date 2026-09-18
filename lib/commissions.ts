import type {RecordItem} from './banca';
export type CommissionEntryType='Comissão'|'Débito'|'Pagamento';
export type CommissionPerson={name:string;note?:string};
export type CommissionEntry={personId:string;type:CommissionEntryType;amount:number;date:string;note?:string};

export function commissionSummary(rows:RecordItem[]){
 const entries=rows.filter(r=>r.kind==='commission_entry');
 const people=rows.filter(r=>r.kind==='commission_person').map(r=>{
  const own=entries.filter(e=>e.data.personId===r.id);
  const balance=own.reduce((sum,e)=>sum+(e.data.type==='Comissão'?e.data.amount:-e.data.amount),0);
  const generated=own.filter(e=>e.data.type==='Comissão').reduce((sum,e)=>sum+e.data.amount,0);
  return {id:r.id,revision:r.revision,name:r.data.name as string,note:(r.data.note||'') as string,balance,generated};
 }).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
 const totalGenerated=people.reduce((sum,p)=>sum+p.generated,0);
 return {people,totalGenerated};
}
