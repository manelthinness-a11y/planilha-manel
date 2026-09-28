import {summary,grantsOf,type RecordItem} from './banca';
import {TRACKS} from './alavancagem';

// Dados das duas telas de detalhe abertas pelos cards da Visão geral:
// "Real em apostas" → apostas em aberto; "Freebets disponíveis" → freebets.

export type OpenBet={
 /** Qual tela registrou a aposta. */
 origin:'Arbitragem'|'Alavancagem'|'Camilo'|'Entrada avulsa'|'ODD 5';
 /** Rótulo da origem já com o grupo (ex.: "Alavancagem 1,3 · Individual"). */
 originLabel:string;
 /** Aba do app onde essa aposta pode ser liquidada. */
 tab:string;
 /** id do registro (arbitragem ou entrada) e, na arbitragem, id da aposta. */
 recordId:string;betId?:string;
 event:string;selection:string;date:string;
 accountId:string;accountLabel:string;
 capital:'Real'|'Freebet';stake:number;odd:number;
 /** Quanto volta se ganhar (freebet devolve só o lucro). */
 potential:number;
 /** Entra no valor do card "Real em apostas"? (ODD 5 e freebets não entram.) */
 countsInExposure:boolean;
};

const dateBR=(d:string)=>d?d.split('-').reverse().join('/'):'';
const potentialOf=(stake:number,odd:number,capital:'Real'|'Freebet')=>Math.round(stake*(capital==='Freebet'?odd-1:odd)*100)/100;

/** Todas as apostas ainda sem resultado, em todas as abas, já com o rótulo da conta. */
export function openBets(rows:RecordItem[]):OpenBet[]{
 const s=summary(rows);
 const label=(id:string)=>{const a=s.accounts.find(x=>x.id===id);return a?a.house+' · '+a.holder:'Conta removida';};
 const labelByName=(d:any)=>(d.accountId&&s.accounts.some(a=>a.id===d.accountId))?label(d.accountId):(d.house&&d.account?d.house+' · '+d.account:'Conta removida');
 const out:OpenBet[]=[];
 for(const r of rows.filter(r=>r.kind==='arb')){
  for(const b of r.data.bets||[]){
   if(b.status!=='Pendente')continue;
   const capital:'Real'|'Freebet'=b.capital==='Freebet'?'Freebet':'Real';
   out.push({origin:'Arbitragem',originLabel:'Arbitragem',tab:'arbitragens',recordId:r.id,betId:b.id,event:r.data.event,selection:b.selection||r.data.market||'',date:r.data.date||'',accountId:b.account,accountLabel:label(b.account),capital,stake:b.stake||0,odd:Number(b.odd)||0,potential:potentialOf(b.stake||0,Number(b.odd)||0,capital),countsInExposure:capital==='Real'});
  }
 }
 for(const r of rows.filter(r=>r.kind==='alavancagem'&&r.data.result==='Pendente')){
  const d=r.data;const group=d.group??'alavancagem';
  const track=TRACKS.find(t=>t.mainGroup===group||t.individualGroup===group);
  const originLabel=(track?.label||'Alavancagem')+(track&&track.individualGroup===group?' · Individual':'');
  out.push({origin:'Alavancagem',originLabel,tab:track?.mainGroup||'alavancagem',recordId:r.id,event:d.event||'',selection:d.market||'',date:d.date||'',accountId:d.accountId||'',accountLabel:labelByName(d),capital:'Real',stake:d.stake||0,odd:Number(d.odd)||0,potential:potentialOf(d.stake||0,Number(d.odd)||0,'Real'),countsInExposure:true});
 }
 for(const [kind,origin,tab] of [['camilo','Camilo','camilo'],['avulsa','Entrada avulsa','avulsa'],['odd5','ODD 5','odd5']] as const){
  for(const r of rows.filter(r=>r.kind===kind&&r.data.result==='Pendente')){
   const d=r.data;
   out.push({origin,originLabel:origin,tab,recordId:r.id,event:d.event||'',selection:(d.markets||[]).join(' · '),date:d.date||'',accountId:d.accountId||'',accountLabel:labelByName(d),capital:'Real',stake:d.stake||0,odd:Number(d.odd)||0,potential:potentialOf(d.stake||0,Number(d.odd)||0,'Real'),countsInExposure:kind!=='odd5'});
  }
 }
 return out.sort((a,b)=>(b.date||'').localeCompare(a.date||'')||a.event.localeCompare(b.event,'pt-BR'));
}

/** Totais do topo da tela de apostas em aberto. */
export function openBetsTotals(bets:OpenBet[]){
 const real=bets.filter(b=>b.countsInExposure&&b.capital==='Real');
 const free=bets.filter(b=>b.capital==='Freebet');
 return {
  count:bets.length,
  exposure:real.reduce((sum,b)=>sum+b.stake,0),
  freebetsInPlay:free.reduce((sum,b)=>sum+b.stake,0),
  potential:bets.filter(b=>b.countsInExposure||b.capital==='Freebet').reduce((sum,b)=>sum+b.potential,0),
  events:new Set(bets.map(b=>b.origin+':'+b.recordId)).size,
 };
}

export type FreebetDetail={
 id:string;
 /** Conta que recebeu o crédito. */
 accountId:string;accountLabel:string;
 /** De onde veio: crédito avulso (movimentação) ou a arbitragem que gerou a promoção. */
 source:'Crédito avulso'|'Arbitragem';sourceLabel:string;
 /** Registro que abre ao clicar (movimentação ou arbitragem de origem). */
 recordId:string;recordKind:'movement'|'arb';
 date:string;expires:string;
 /** Dias até vencer (negativo = já venceu; null = sem data). */
 daysLeft:number|null;
 amount:number;used:number;remaining:number;
 status:'Disponível'|'Usada'|'Vencida';
 /** Apostas que consumiram este crédito. */
 uses:{event:string;stake:number;status:string;arbId:string}[];
 note:string;
};

/** Cada freebet recebida, com quanto já foi usado, onde, e o que ainda resta. */
export function freebetDetails(rows:RecordItem[]):FreebetDetail[]{
 const s=summary(rows);
 const label=(id:string)=>{const a=s.accounts.find(x=>x.id===id);return a?a.house+' · '+a.holder:'Conta removida';};
 const today=new Date().toISOString().slice(0,10);
 const days=(expires:string)=>expires?Math.round((Date.parse(expires+'T00:00:00Z')-Date.parse(today+'T00:00:00Z'))/86400000):null;
 return grantsOf(rows).map((g:any)=>{
  const uses=rows.filter(r=>r.kind==='arb').flatMap(r=>(r.data.bets||[]).filter((b:any)=>b.capital==='Freebet'&&b.lot===g.id&&!(b.status==='Cancelada'&&b.reissued)).map((b:any)=>({event:r.data.event as string,stake:b.stake as number,status:b.status as string,arbId:r.id})));
  const used=uses.reduce((sum,u)=>sum+u.stake,0);
  const remaining=g.amount-used;
  const expired=!!g.expires&&g.expires<today;
  const linked=!!g.sourceArb;
  return {
   id:g.id,accountId:g.account,accountLabel:label(g.account),
   source:linked?'Arbitragem':'Crédito avulso',sourceLabel:linked?g.event:(g.note||'Freebet recebida'),
   recordId:linked?g.sourceArb:g.id,recordKind:linked?'arb':'movement',
   date:g.date||'',expires:g.expires||'',daysLeft:days(g.expires||''),
   amount:g.amount,used,remaining,
   status:expired?'Vencida':remaining<=0?'Usada':'Disponível',
   uses,note:g.note||'',
  } as FreebetDetail;
 }).sort((a,b)=>{
  const rank=(x:FreebetDetail)=>x.status==='Disponível'?0:x.status==='Usada'?1:2;
  return rank(a)-rank(b)||(a.expires||'9999').localeCompare(b.expires||'9999')||b.date.localeCompare(a.date);
 });
}

/** Totais do topo da tela de freebets. */
export function freebetTotals(list:FreebetDetail[]){
 const available=list.filter(f=>f.status==='Disponível');
 return {
  available:available.reduce((sum,f)=>sum+f.remaining,0),
  availableCount:available.length,
  expiringSoon:available.filter(f=>f.daysLeft!==null&&f.daysLeft<=3).reduce((sum,f)=>sum+f.remaining,0),
  expiringSoonCount:available.filter(f=>f.daysLeft!==null&&f.daysLeft<=3).length,
  received:list.reduce((sum,f)=>sum+f.amount,0),
  used:list.reduce((sum,f)=>sum+f.used,0),
 };
}

export const formatDate=dateBR;
