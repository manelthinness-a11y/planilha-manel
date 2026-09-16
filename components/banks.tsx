"use client";
import {BankActions} from './bank-actions';
import {Landmark,Pencil} from 'lucide-react';
import {Select,SelectTrigger,SelectContent,SelectItem,SelectValue} from '@/components/ui/select';
import {money} from '@/lib/banca';
import type {bankSummary} from '@/lib/banks';

type Props={
 summary:ReturnType<typeof bankSummary>;
 personKey:string;
 bankId:string;
 disabled:boolean;
 onPersonChange:(key:string)=>void;
 onBankChange:(id:string)=>void;
 onEdit:(id:string)=>void;
 onUpdated:()=>void;
};

export function BanksPanel({summary,personKey,bankId,disabled,onPersonChange,onBankChange,onEdit,onUpdated}:Props){
 const person=summary.people.find(p=>p.key===personKey);
 const bank=person?.banks.find(b=>b.id===bankId);
 const ranked=[...summary.banks].sort((a,b)=>b.balance-a.balance||a.holder.localeCompare(b.holder,'pt-BR')||a.bank.localeCompare(b.bank,'pt-BR')||a.id.localeCompare(b.id));
 return <div className="account-selector bank-selector">
  <div className="account-selectors">
   <label className="field">Pessoa
    <Select value={person?.key||''} disabled={disabled} onValueChange={onPersonChange}>
     <SelectTrigger className="picker"><SelectValue placeholder="Selecione"/></SelectTrigger>
     <SelectContent>{summary.people.map(p=><SelectItem key={p.key} value={p.key}>{p.name}</SelectItem>)}</SelectContent>
    </Select>
   </label>
   <label className="field">Banco
    <Select key={person?.key||'none'} value={bank?.id||''} disabled={disabled||!person} onValueChange={onBankChange}>
     <SelectTrigger className="picker"><SelectValue placeholder="Selecione"/></SelectTrigger>
     <SelectContent>{person?.banks.map(b=><SelectItem key={b.id} value={b.id}>{b.bank}</SelectItem>)}</SelectContent>
    </Select>
   </label>
  </div>
  {person&&<button type="button" className="picker" disabled={disabled} onClick={()=>onPersonChange('')}>Ver todos os bancos por saldo</button>}
  {!person&&<section aria-label="Bancos do maior para o menor saldo">
   <h3 style={{fontSize:18,margin:'0 0 6px'}}>Maiores saldos</h3>
   <p style={{margin:'0 0 16px',color:'var(--muted-foreground)'}}>Todos os bancos, do maior saldo para o menor. Clique em um cartão para consultar.</p>
   <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 230px), 1fr))',gap:14}}>
    {ranked.map(item=><button key={item.id} type="button" className="account-card bank-card" disabled={disabled} aria-label={item.bank+' · '+item.holder+' · '+money(item.balance)} style={{width:'100%',textAlign:'left',cursor:disabled?'default':'pointer',font:'inherit'}} onClick={()=>{const owner=summary.people.find(p=>p.banks.some(b=>b.id===item.id));if(owner){onPersonChange(owner.key);onBankChange(item.id);}}}>
     <div className="account-head"><span className="house-icon"><Landmark size={22}/></span><div><b>{item.bank}</b><small>{item.holder}</small></div></div>
     <small>Saldo disponível</small>
     <strong className={item.balance<0?'negative':''}>{money(item.balance)}</strong>
    </button>)}
   </div>
  </section>}
  {person&&<section className="person-balance" aria-live="polite">
   <span>Saldo total nos bancos · {person.name}</span>
   <strong>{money(person.total)}</strong>
   <small>Somando {person.banks.length} {person.banks.length===1?'banco cadastrado':'bancos cadastrados'}</small>
  </section>}
  <div aria-live="polite">{!person?null:bank?<article className="account-card bank-card" aria-label={bank.bank+' · '+person?.name}>
   <div className="account-head"><span className="house-icon"><Landmark size={22}/></span><div><b>{bank.bank}</b><small>{person?.name}</small></div></div>
   <small>Saldo disponível neste banco</small>
   <strong className={bank.balance<0?'negative':''}>{money(bank.balance)}</strong>
   <BankActions key={bank.id} bank={bank} banks={summary.banks} disabled={disabled} onUpdated={onUpdated}/>
   {bank.note&&<p className="bank-note">{bank.note}</p>}
   <div className="account-actions"><button type="button" disabled={disabled} onClick={()=>onEdit(bank.id)}><Pencil size={17}/>Editar banco e saldo</button></div>
  </article>:<div className="quiet-empty">{person?'Selecione um banco para consultar e atualizar seu saldo.':''}</div>}</div>
 </div>;
}
