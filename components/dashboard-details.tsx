"use client";
import {useState} from 'react';
import {ArrowLeft,ChevronRight,Gift,Layers,Clock,Wallet} from 'lucide-react';
import {Table,TableHeader,TableBody,TableHead,TableRow,TableCell} from '@/components/ui/table';
import {money,type RecordItem} from '@/lib/banca';
import {openBets,openBetsTotals,freebetDetails,freebetTotals,formatDate,type OpenBet} from '@/lib/open-bets';

// Telas abertas pelos cards da Visão geral: "Real em apostas" → apostas em
// aberto (todas as abas); "Freebets disponíveis" → freebets e seus detalhes.

type Common={rows:RecordItem[];disabled:boolean;onBack:()=>void;onOpenArb:(id:string)=>void};

export function BackButton({onBack}:{onBack:()=>void}){
 return <button type="button" className="secondary" onClick={onBack}><ArrowLeft size={16}/>Voltar para a Visão geral</button>;
}

const ORIGINS:OpenBet['origin'][]=['Arbitragem','Alavancagem','Camilo','Entrada avulsa','ODD 5'];

export function OpenBetsView({rows,disabled,onBack,onOpenArb,onGoTab}:Common&{onGoTab:(tab:string)=>void}){
 const bets=openBets(rows);
 const t=openBetsTotals(bets);
 const byOrigin=ORIGINS.map(origin=>({origin,items:bets.filter(b=>b.origin===origin)})).filter(g=>g.items.length);
 return <div>
  <section className="stats" style={{marginBottom:24}}>
   <div className="stat"><span>Real em apostas <Layers size={19}/></span><strong>{money(t.exposure)}</strong><small>Dinheiro real parado em apostas sem resultado</small></div>
   <div className="stat"><span>Apostas em aberto <Clock size={19}/></span><strong>{t.count}</strong><small>em {t.events} {t.events===1?'operação':'operações'}</small></div>
   <div className="stat"><span>Freebets em jogo <Gift size={19}/></span><strong>{money(t.freebetsInPlay)}</strong><small>Créditos promocionais apostados e ainda sem resultado</small></div>
   <div className="stat"><span>Retorno se tudo ganhar <Wallet size={19}/></span><strong className="positive">{money(t.potential)}</strong><small>Soma de stake × odd (freebet devolve só o lucro)</small></div>
  </section>
  {!bets.length&&<div className="quiet-empty">Nenhuma aposta em aberto no momento. Tudo o que foi registrado já tem resultado.</div>}
  {byOrigin.map(group=><div key={group.origin}>
   <div className="section-title"><h2>{group.origin} <span>{group.items.length}</span></h2>{group.origin!=='Arbitragem'&&<button type="button" disabled={disabled} onClick={()=>onGoTab(group.items[0].tab)}>Abrir a aba {group.items[0].originLabel.split(' · ')[0]} <ChevronRight size={16}/></button>}</div>
   {group.origin==='ODD 5'&&<p className="hint" style={{marginTop:-8}}>As entradas da ODD 5 são controladas à parte e não entram no valor de &ldquo;Real em apostas&rdquo;.</p>}
   {group.origin==='Arbitragem'?<ArbGroups items={group.items} disabled={disabled} onOpenArb={onOpenArb}/>:<div className="arb-list">{group.items.map(b=><article className="arb-card" key={b.recordId}>
    <button type="button" className="arb-row" disabled={disabled} onClick={()=>onGoTab(b.tab)} aria-label={'Abrir '+b.originLabel+' para liquidar '+b.event}>
     <div className="arb-icon"><Layers size={20}/></div>
     <div className="arb-name"><b>{b.event}</b><small>{b.originLabel}{b.date?' · '+formatDate(b.date):''}</small></div>
     <span className="pill">Em aberto</span>
     <div className="arb-result"><strong>{money(b.stake)}</strong><small>Stake</small></div>
     <ChevronRight size={18}/>
    </button>
    <div className="open-bets-list"><div className="open-bet">
     <div><b>{b.accountLabel}</b><small>{b.selection||'—'}</small></div>
     <div><span className="pill">{b.capital}</span></div>
     <div><b>{money(b.stake)}</b><small>Stake</small></div>
     <div><b>{b.odd?b.odd.toFixed(2).replace('.',','):'—'}</b><small>Odd</small></div>
     <div><b className="positive">{money(b.potential)}</b><small>Se ganhar</small></div>
    </div></div>
   </article>)}</div>}
  </div>)}
  <div style={{marginTop:28}}><BackButton onBack={onBack}/></div>
 </div>;
}

function ArbGroups({items,disabled,onOpenArb}:{items:OpenBet[];disabled:boolean;onOpenArb:(id:string)=>void}){
 const arbs=[...new Map(items.map(b=>[b.recordId,b])).values()];
 return <div className="arb-list">{arbs.map(first=>{
  const bets=items.filter(b=>b.recordId===first.recordId);
  const real=bets.filter(b=>b.capital==='Real').reduce((sum,b)=>sum+b.stake,0);
  return <article className="arb-card" key={first.recordId}>
   <button type="button" className="arb-row" disabled={disabled} onClick={()=>onOpenArb(first.recordId)}>
    <div className="arb-icon"><Layers size={20}/></div>
    <div className="arb-name"><b>{first.event}</b><small>{bets.length} {bets.length===1?'aposta pendente':'apostas pendentes'}{first.date?' · '+formatDate(first.date):''}</small></div>
    <span className="pill">Em aberto</span>
    <div className="arb-result"><strong>{money(real)}</strong><small>Real em aberto</small></div>
    <ChevronRight size={18}/>
   </button>
   <div className="open-bets-list">{bets.map(b=><div className="open-bet" key={b.betId||b.recordId}>
    <div><b>{b.accountLabel}</b><small>{b.selection||'—'}</small></div>
    <div><span className={'pill '+(b.capital==='Freebet'?'done':'')}>{b.capital}</span></div>
    <div><b>{money(b.stake)}</b><small>Stake</small></div>
    <div><b>{b.odd?b.odd.toFixed(2).replace('.',','):'—'}</b><small>Odd</small></div>
    <div><b className="positive">{money(b.potential)}</b><small>Se ganhar</small></div>
   </div>)}</div>
  </article>;
 })}</div>;
}

export function FreebetsView({rows,disabled,onBack,onOpenArb,onOpenMovement}:Common&{onOpenMovement:(id:string)=>void}){
 const list=freebetDetails(rows);
 const t=freebetTotals(list);
 const available=list.filter(f=>f.status==='Disponível');
 const others=list.filter(f=>f.status!=='Disponível');
 const [showOthers,setShowOthers]=useState(false);
 function openSource(f:(typeof list)[number]){if(f.recordKind==='arb')onOpenArb(f.recordId);else onOpenMovement(f.recordId);}
 const expiry=(f:(typeof list)[number])=>!f.expires?'Sem data':f.daysLeft===null?formatDate(f.expires):f.daysLeft<0?formatDate(f.expires)+' · vencida':f.daysLeft===0?formatDate(f.expires)+' · vence hoje':formatDate(f.expires)+' · '+f.daysLeft+' dia'+(f.daysLeft===1?'':'s');
 return <div>
  <section className="stats" style={{marginBottom:24}}>
   <div className="stat"><span>Freebets disponíveis <Gift size={19}/></span><strong>{money(t.available)}</strong><small>{t.availableCount} {t.availableCount===1?'crédito':'créditos'} com saldo para usar</small></div>
   <div className="stat"><span>Vencendo em até 3 dias <Clock size={19}/></span><strong className={t.expiringSoonCount?'negative':''}>{money(t.expiringSoon)}</strong><small>{t.expiringSoonCount?t.expiringSoonCount+' crédito(s) — use antes de vencer':'Nenhum crédito perto do vencimento'}</small></div>
   <div className="stat"><span>Total recebido <Wallet size={19}/></span><strong>{money(t.received)}</strong><small>Todos os créditos já recebidos, usados ou não</small></div>
   <div className="stat"><span>Já usado <Layers size={19}/></span><strong>{money(t.used)}</strong><small>Apostado com freebet (inclui apostas em aberto)</small></div>
  </section>
  <div className="section-title"><h2>Disponíveis agora <span>{available.length}</span></h2></div>
  {available.length?<FreebetCards list={available} disabled={disabled} onOpen={openSource} expiry={expiry}/>:<div className="quiet-empty">Nenhuma freebet disponível no momento.</div>}
  {!!others.length&&<><div className="section-title"><h2>Usadas ou vencidas <span>{others.length}</span></h2><button type="button" onClick={()=>setShowOthers(v=>!v)}>{showOthers?'Ocultar':'Mostrar'} <ChevronRight size={16} style={{transform:showOthers?'rotate(90deg)':'none'}}/></button></div>
   {showOthers&&<div className="panel"><Table><TableHeader><TableRow>{['Conta','Origem','Recebida em','Vencimento','Crédito','Usado','Situação'].map(h=><TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader><TableBody>{others.map(f=><TableRow key={f.id}><TableCell>{f.accountLabel}</TableCell><TableCell>{f.source}<small>{f.sourceLabel}</small></TableCell><TableCell>{formatDate(f.date)||'—'}</TableCell><TableCell>{expiry(f)}</TableCell><TableCell>{money(f.amount)}</TableCell><TableCell>{money(f.used)}</TableCell><TableCell><span className={'pill '+(f.status==='Usada'?'done':'')}>{f.status}</span></TableCell></TableRow>)}</TableBody></Table></div>}</>}
  <div style={{marginTop:28}}><BackButton onBack={onBack}/></div>
 </div>;
}

function FreebetCards({list,disabled,onOpen,expiry}:{list:ReturnType<typeof freebetDetails>;disabled:boolean;onOpen:(f:ReturnType<typeof freebetDetails>[number])=>void;expiry:(f:ReturnType<typeof freebetDetails>[number])=>string}){
 return <div className="account-grid">{list.map(f=><article className="account-card" key={f.id} aria-label={'Freebet '+f.accountLabel}>
  <button type="button" className="account-head account-edit" disabled={disabled} onClick={()=>onOpen(f)} aria-label={'Abrir origem da freebet de '+f.accountLabel}><span className="house-icon"><Gift size={18}/></span><span><b>{f.accountLabel}</b><small>{f.source}{f.sourceLabel?' · '+f.sourceLabel:''}</small></span><ChevronRight size={18}/></button>
  <small>Restante para usar</small>
  <strong>{money(f.remaining)}</strong>
  <div className="account-footer"><span>Crédito <b>{money(f.amount)}</b></span><span>Usado <b>{money(f.used)}</b></span></div>
  <div className="account-footer"><span>Recebida em <b>{formatDate(f.date)||'—'}</b></span><span>Vencimento <b className={f.daysLeft!==null&&f.daysLeft<=3?'negative':''}>{expiry(f)}</b></span></div>
  {!!f.uses.length&&<div className="account-footer" style={{flexDirection:'column',gap:6}}><span>Usada em</span>{f.uses.map((u,i)=><b key={i} style={{marginTop:0}}>{u.event} · {money(u.stake)} · {u.status}</b>)}</div>}
 </article>)}</div>;
}
