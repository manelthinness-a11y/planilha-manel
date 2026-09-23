export type RecordItem={id:string;kind:string;data:any;revision:number};
export const money=(v:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v/100);
export function grantsOf(rows:RecordItem[]){
 const manual=rows.filter(r=>r.kind==='movement'&&r.data.type==='Freebet recebida').map(r=>({...r.data,id:r.id,remaining:r.data.amount}));
 const linked=rows.filter(r=>r.kind==='arb'&&r.data.promo?.status==='Recebida').map(r=>({...r.data.promo,id:'promo:'+r.id,sourceArb:r.id,event:r.data.event,amount:r.data.promo.received,remaining:r.data.promo.received,date:r.data.promo.receivedDate}));
 return [...manual,...linked];
}
export function summary(rows:RecordItem[]){
 const accounts=rows.filter(r=>r.kind==='account').map(r=>({...r.data,id:r.id,real:r.data.initial,exposure:0,free:0,profit:0}));
 const grants=grantsOf(rows);
 const byId=Object.fromEntries(accounts.map(a=>[a.id,a]));let profit=0,open=0;
 for(const r of rows.filter(r=>r.kind==='movement')){const a=byId[r.data.account];if(!a)continue;const m=r.data;if(m.type==='Depósito'||m.type==='Ajuste positivo')a.real+=m.amount;if(m.type==='Saque'||m.type==='Ajuste negativo')a.real-=m.amount;}
 const arbs=rows.filter(r=>r.kind==='arb').map(r=>{let total=0,received=0,cost=0,done=true;for(const b of r.data.bets){const a=byId[b.account];total+=b.stake;if(b.capital==='Real')cost+=b.stake;if(b.status==='Pendente'){done=false;open++;}const ret=b.status==='Ganhou'||b.status==='Cashout'?b.returned:b.status==='Cancelada'&&b.capital==='Real'?b.stake:0;received+=ret;if(a){a.real+=ret-(b.capital==='Real'?b.stake:0);if(b.status==='Pendente'&&b.capital==='Real')a.exposure+=b.stake;if(b.status!=='Pendente')a.profit+=ret-(b.capital==='Real'?b.stake:0);}if(b.capital==='Freebet'&&!(b.status==='Cancelada'&&b.reissued)){const lot=grants.find(g=>g.id===b.lot);if(lot)lot.remaining-=b.stake;}}
 const previousLoss=r.data.bets.reduce((sum:number,b:any)=>sum+(b.capital==='Freebet'?(b.previousLoss||0):0),0);const result=received-cost;const extractionResult=result-previousLoss;const betsDone=done;const awaitingPromo=r.data.promo?.status==='Aguardando';if(betsDone)profit+=result;done=betsDone&&!awaitingPromo;return {...r.data,id:r.id,revision:r.revision,total,cost,received,done,betsDone,awaitingPromo,result,previousLoss,extractionResult,resultPct:cost?result/cost*100:null};});
 const normKey=(v:string)=>(v||'').normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('pt-BR');
 const byHolderHouse=Object.fromEntries(accounts.map(a=>[normKey(a.holder)+'|'+normKey(a.house),a]));
 for(const r of rows.filter(r=>r.kind==='alavancagem')){
  const d=r.data;const a=(d.accountId&&byId[d.accountId])||byHolderHouse[normKey(d.account)+'|'+normKey(d.house)];
  const stake=d.stake||0,ret=d.result==='Green'?d.prize||0:0;
  if(d.result==='Pendente')open++;
  if(a){a.real+=ret-stake;if(d.result==='Pendente')a.exposure+=stake;if(d.result!=='Pendente')a.profit+=ret-stake;}
 }
 // Camilo: mesma mecânica da alavancagem — Green soma o lucro (prêmio - stake) no saldo
 // real da casa selecionada, Red desconta a stake dessa mesma casa.
 for(const r of rows.filter(r=>r.kind==='camilo')){
  const d=r.data;const a=(d.accountId&&byId[d.accountId])||byHolderHouse[normKey(d.account)+'|'+normKey(d.house)];
  const stake=d.stake||0,ret=d.result==='Green'?d.prize||0:0;
  if(d.result==='Pendente')open++;
  if(a){a.real+=ret-stake;if(d.result==='Pendente')a.exposure+=stake;if(d.result!=='Pendente')a.profit+=ret-stake;}
 }
 const today=new Date().toISOString().slice(0,10);for(const g of grants){g.expired=!!g.expires&&g.expires<today;if(byId[g.account]&&!g.expired)byId[g.account].free+=g.remaining;}
 const realizedPreviousLoss=arbs.filter(a=>a.betsDone).reduce((total,a)=>total+a.previousLoss,0);
 const netProfit=profit-realizedPreviousLoss;
 return {accounts,grants,arbs,profit,netProfit,realizedPreviousLoss,open,real:accounts.reduce((s,a)=>s+a.real,0),free:accounts.reduce((s,a)=>s+a.free,0),exposure:accounts.reduce((s,a)=>s+a.exposure,0)};
}
