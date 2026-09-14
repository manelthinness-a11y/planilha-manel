import type {RecordItem} from './banca';

export type BankData={bank:string;holder:string;balance:number;note:string};
export type BankAccount=BankData&{id:string;revision:number};
export const bankNameKey=(name:string)=>name.normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('pt-BR');

export function bankSummary(rows:RecordItem[]){
 const banks:BankAccount[]=rows.filter(r=>r.kind==='bank').map(r=>({...r.data,id:r.id,revision:r.revision}));
 const grouped=new Map<string,{key:string;name:string;banks:BankAccount[];total:number}>();
 for(const bank of banks){
  const key=bankNameKey(bank.holder);
  const person=grouped.get(key)||{key,name:bank.holder,banks:[],total:0};
  person.banks.push(bank);person.total+=bank.balance;grouped.set(key,person);
 }
 const people=[...grouped.values()].sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
 for(const person of people)person.banks.sort((a,b)=>a.bank.localeCompare(b.bank,'pt-BR'));
 return {banks,people};
}
