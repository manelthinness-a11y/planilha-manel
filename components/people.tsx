"use client";
import {useState} from 'react';
import {Users,TrendingUp,TrendingDown,ChevronRight,Wallet} from 'lucide-react';
import {Table,TableHeader,TableBody,TableHead,TableRow,TableCell} from '@/components/ui/table';
import {money,type RecordItem} from '@/lib/banca';
import {peopleResults,peopleTotals,ORIGINS} from '@/lib/people-results';
import {type PeriodFilter,periodLabel} from '@/lib/period-filter';

// Aba "Pessoas": quanto cada pessoa deu no período, somando todas as origens.
// Clicar numa pessoa abre o detalhe por casa; "Ver contas" leva à aba Contas
// já filtrada por ela.

type Props={rows:RecordItem[];period:PeriodFilter;onOpenAccounts:(personKey:string)=>void};
const signed=(v:number)=>(v>0?'+':v<0?'−':'')+' '+money(Math.abs(v));
const cls=(v:number)=>v>0?'positive':v<0?'negative':'';

export function PeoplePanel({rows,period,onOpenAccounts}:Props){
 const list=peopleResults(rows,period);
 const t=peopleTotals(list);
 const [openKey,setOpenKey]=useState('');
 const best=list[0],worst=list[list.length-1];
 const activeOrigins=ORIGINS.filter(([k])=>list.some(p=>p.byOrigin[k]!==0));
 return <div>
  <p className="hint" style={{margin:0}}>Resultado de cada pessoa em <b>{periodLabel(period)}</b>, somando arbitragens, alavancagem, Camilo, entrada avulsa, ODD 5 e cassino. Só entram operações já liquidadas; o que está em aberto aparece quando sair o resultado.</p>
  <section className="stats" style={{margin:'16px 0'}}>
   <div className="stat"><span>Resultado do período <Wallet size={19}/></span><strong className={cls(t.total)}>{money(t.total)}</strong><small>{t.count} {t.count===1?'operação liquidada':'operações liquidadas'} · {t.people} {t.people===1?'pessoa':'pessoas'}</small></div>
   <div className="stat"><span>Melhor resultado <TrendingUp size={19}/></span><strong className={best?cls(best.total):''}>{best?money(best.total):'—'}</strong><small>{best?best.name:'Sem operações no período'}</small></div>
   <div className="stat"><span>Pior resultado <TrendingDown size={19}/></span><strong className={worst?cls(worst.total):''}>{worst?money(worst.total):'—'}</strong><small>{worst?worst.name:'Sem operações no período'}</small></div>
   <div className="stat"><span>No positivo / negativo <Users size={19}/></span><strong><span className="positive">{t.positive}</span> / <span className="negative">{t.negative}</span></strong><small>pessoas com lucro / com prejuízo no período</small></div>
  </section>
  {!list.length&&<div className="quiet-empty">Nenhuma operação liquidada no período selecionado. Mude o período na barra de cima para ver outros meses.</div>}
  {!!list.length&&<div className="panel"><Table><TableHeader><TableRow><TableHead>Pessoa</TableHead>{activeOrigins.map(([k,label])=><TableHead key={k}>{label}</TableHead>)}<TableHead>Total</TableHead><TableHead>Operações</TableHead><TableHead></TableHead></TableRow></TableHeader><TableBody>
   {list.flatMap(p=>{
    const open=openKey===p.key;
    const main=<TableRow key={p.key} className="person-row" data-open={open?'true':undefined}>
     <TableCell><button type="button" className="person-toggle" onClick={()=>setOpenKey(open?'':p.key)} aria-expanded={open} aria-label={(open?'Recolher':'Ver casas de')+' '+p.name}><ChevronRight size={16} style={{transform:open?'rotate(90deg)':'none'}}/><b>{p.name}</b></button><small>{p.accounts.length} {p.accounts.length===1?'casa':'casas'}</small></TableCell>
     {activeOrigins.map(([k])=><TableCell key={k} className={cls(p.byOrigin[k])}>{p.byOrigin[k]?signed(p.byOrigin[k]):'—'}</TableCell>)}
     <TableCell><b className={cls(p.total)}>{signed(p.total)}</b></TableCell>
     <TableCell>{p.count}</TableCell>
     <TableCell><button type="button" className="text-button" onClick={()=>onOpenAccounts(p.key)}>Ver contas</button></TableCell>
    </TableRow>;
    if(!open)return [main];
    return [main,...p.accounts.map(a=><TableRow key={p.key+'|'+a.house} className="person-account-row">
     <TableCell><span className="person-account">{a.house}</span></TableCell>
     {activeOrigins.map(([k])=><TableCell key={k} className={cls(a.byOrigin[k])}>{a.byOrigin[k]?signed(a.byOrigin[k]):'—'}</TableCell>)}
     <TableCell><b className={cls(a.total)}>{signed(a.total)}</b></TableCell>
     <TableCell>{a.count}</TableCell>
     <TableCell></TableCell>
    </TableRow>)];
   })}
   <TableRow className="person-total-row"><TableCell><b>Total</b></TableCell>{activeOrigins.map(([k])=><TableCell key={k} className={cls(t.byOrigin[k])}><b>{t.byOrigin[k]?signed(t.byOrigin[k]):'—'}</b></TableCell>)}<TableCell><b className={cls(t.total)}>{signed(t.total)}</b></TableCell><TableCell><b>{t.count}</b></TableCell><TableCell></TableCell></TableRow>
  </TableBody></Table></div>}
 </div>;
}
