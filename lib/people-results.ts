import type {RecordItem} from './banca';
import {TRACKS} from './alavancagem';
import {type PeriodFilter,inPeriod} from './period-filter';

// Tela "Pessoas": resultado de cada pessoa no período, somando todas as origens
// (arbitragens, alavancagem, camilo, entrada avulsa, ODD 5 e cassino). Só
// entram operações já liquidadas — pendentes não contam até sair o resultado.

export const ORIGINS=[['arb','Arbitragens'],['alavancagem','Alavancagem'],['camilo','Camilo'],['avulsa','Entrada avulsa'],['odd5','ODD 5'],['cassino','Cassino']] as const;
export type Origin=(typeof ORIGINS)[number][0];

export type PersonResult={
 key:string;name:string;
 byOrigin:Record<Origin,number>;
 total:number;count:number;
 accounts:{house:string;total:number;count:number;byOrigin:Record<Origin,number>}[];
};

const normKey=(v:string)=>(v||'').normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('pt-BR');
const emptyOrigins=():Record<Origin,number>=>({arb:0,alavancagem:0,camilo:0,avulsa:0,odd5:0,cassino:0});

export function peopleResults(rows:RecordItem[],period:PeriodFilter):PersonResult[]{
 const accounts=new Map(rows.filter(r=>r.kind==='account').map(r=>[r.id,{holder:r.data.holder as string,house:r.data.house as string}]));
 const people=new Map<string,PersonResult>();
 function add(holder:string,house:string,origin:Origin,value:number){
  const key=normKey(holder);if(!key)return;
  const p=people.get(key)||{key,name:holder.trim(),byOrigin:emptyOrigins(),total:0,count:0,accounts:[]};
  p.byOrigin[origin]+=value;p.total+=value;p.count++;
  const hk=normKey(house);
  let a=p.accounts.find(x=>normKey(x.house)===hk);
  if(!a){a={house:house.trim()||'(sem casa)',total:0,count:0,byOrigin:emptyOrigins()};p.accounts.push(a);}
  a.total+=value;a.count++;a.byOrigin[origin]+=value;
  people.set(key,p);
 }
 const entryAccount=(d:any)=>d.accountId&&accounts.has(d.accountId)?accounts.get(d.accountId)!:{holder:d.account||'',house:d.house||''};
 for(const r of rows){
  const d=r.data;
  if(r.kind==='arb'){
   if(!inPeriod(d.date,period))continue;
   for(const b of d.bets||[]){
    if(b.status==='Pendente')continue;
    const a=accounts.get(b.account);if(!a)continue;
    const real=b.capital!=='Freebet';
    const ret=b.status==='Ganhou'||b.status==='Cashout'?b.returned||0:b.status==='Cancelada'&&real?b.stake:0;
    add(a.holder,a.house,'arb',ret-(real?b.stake:0));
   }
  }else if(r.kind==='alavancagem'||r.kind==='camilo'||r.kind==='avulsa'||r.kind==='odd5'){
   if(d.result==='Pendente'||!inPeriod(d.date,period))continue;
   const a=entryAccount(d);
   add(a.holder,a.house,r.kind==='alavancagem'?'alavancagem':r.kind,d.result==='Green'?(d.prize||0)-(d.stake||0):-(d.stake||0));
  }else if(r.kind==='cassino'){
   if(!inPeriod(d.date,period))continue;
   const a=entryAccount(d);
   add(a.holder,a.house,'cassino',d.type==='Ganho'?d.amount||0:-(d.amount||0));
  }
 }
 const list=[...people.values()];
 for(const p of list)p.accounts.sort((x,y)=>y.total-x.total||x.house.localeCompare(y.house,'pt-BR'));
 return list.sort((x,y)=>y.total-x.total||x.name.localeCompare(y.name,'pt-BR'));
}

/** Totais gerais da tela (soma de todas as pessoas). */
export function peopleTotals(list:PersonResult[]){
 const byOrigin=emptyOrigins();
 for(const p of list)for(const o of ORIGINS)byOrigin[o[0]]+=p.byOrigin[o[0]];
 return {total:list.reduce((sum,p)=>sum+p.total,0),count:list.reduce((sum,p)=>sum+p.count,0),people:list.length,positive:list.filter(p=>p.total>0).length,negative:list.filter(p=>p.total<0).length,byOrigin};
}

export const trackLabelOf=(group:string)=>{const t=TRACKS.find(t=>t.mainGroup===group||t.individualGroup===group);return t?t.label:'Alavancagem';};
