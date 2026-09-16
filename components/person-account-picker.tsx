"use client";
import {useState} from 'react';
import {Select,SelectTrigger,SelectContent,SelectItem,SelectValue} from '@/components/ui/select';

type Account={id:string;house:string;holder:string};
const personKey=(name:string)=>name.normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('pt-BR');
export function PersonAccountPicker({accounts,value,onChange,disabled=false,label='Casa / conta'}:{accounts:Account[];value:string;onChange:(id:string)=>void;disabled?:boolean;label?:string}){
 const [chosenPerson,setChosenPerson]=useState('');
 const current=accounts.find(a=>a.id===value);
 const people=[...new Map(accounts.map(a=>[personKey(a.holder),a.holder])).entries()].sort((a,b)=>a[1].localeCompare(b[1],'pt-BR'));
 const person=current?personKey(current.holder):chosenPerson;
 const visible=accounts.filter(a=>personKey(a.holder)===person).sort((a,b)=>a.house.localeCompare(b.house,'pt-BR')||a.id.localeCompare(b.id));
 return <div className="account-selectors" style={{gridColumn:'1 / -1',marginBottom:0}}>
  <label className="field">Pessoa
   <Select value={people.some(([id])=>id===person)?person:''} disabled={disabled} onValueChange={next=>{setChosenPerson(next);if(next!==person)onChange('');}}>
    <SelectTrigger className="picker"><SelectValue placeholder="Selecione a pessoa"/></SelectTrigger>
    <SelectContent>{people.map(([id,name])=><SelectItem key={id} value={id}>{name}</SelectItem>)}</SelectContent>
   </Select>
  </label>
  <label className="field">{label}
   <Select value={current?.id||''} disabled={disabled||!person||!visible.length} onValueChange={onChange}>
    <SelectTrigger className="picker"><SelectValue placeholder={person?'Selecione a casa':'Escolha primeiro a pessoa'}/></SelectTrigger>
    <SelectContent>{visible.map(a=><SelectItem key={a.id} value={a.id}>{a.house}</SelectItem>)}</SelectContent>
   </Select>
  </label>
 </div>;
}
