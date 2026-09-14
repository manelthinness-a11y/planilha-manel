"use client";
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
};

export function BanksPanel({summary,personKey,bankId,disabled,onPersonChange,onBankChange,onEdit}:Props){
 const person=summary.people.find(p=>p.key===personKey);
 const bank=person?.banks.find(b=>b.id===bankId);
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
  {person&&<section className="person-balance" aria-live="polite">
   <span>Saldo total nos bancos · {person.name}</span>
   <strong>{money(person.total)}</strong>
   <small>Somando {person.banks.length} {person.banks.length===1?'banco cadastrado':'bancos cadastrados'}</small>
  </section>}
  <div aria-live="polite">{bank?<article className="account-card bank-card" aria-label={bank.bank+' · '+person?.name}>
   <div className="account-head"><span className="house-icon"><Landmark size={22}/></span><div><b>{bank.bank}</b><small>{person?.name}</small></div></div>
   <small>Saldo disponível neste banco</small>
   <strong className={bank.balance<0?'negative':''}>{money(bank.balance)}</strong>
   {bank.note&&<p className="bank-note">{bank.note}</p>}
   <div className="account-actions"><button type="button" disabled={disabled} onClick={()=>onEdit(bank.id)}><Pencil size={17}/>Editar banco e saldo</button></div>
  </article>:<div className="quiet-empty">{person?'Selecione um banco para consultar e atualizar seu saldo.':'Selecione uma pessoa para consultar o saldo total dos seus bancos.'}</div>}</div>
 </div>;
}
