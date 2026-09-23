import {env} from 'cloudflare:workers';
import {database} from './store';
import {summary,money,type RecordItem} from './banca';
import {bankSummary} from './banks';
import {commissionSummary} from './commissions';
import {sendMessage,esc} from './telegram';

// Mesmo ID fixo usado pelo bot do Telegram (app/api/telegram-webhook/route.ts)
// — é para onde todos os alertas automáticos são enviados.
const ALLOWED_USER_ID=6040979260;

const LOW_BALANCE_THRESHOLD=10000; // R$ 100,00 por conta/banco
const LOW_TOTAL_THRESHOLD=200000; // R$ 2.000,00 no saldo total geral
const PENDING_DAYS_THRESHOLD=2; // arbitragem/comissão pendente há N dias
const FREEBET_EXPIRY_DAYS_THRESHOLD=2; // avisa quando faltam N dias (ou menos) pro vencimento

type Env={TELEGRAM_BOT_TOKEN?:string};
function getEnv():Env{return env as unknown as Env;}

async function notify(text:string):Promise<void>{
 try{await sendMessage(getEnv(),ALLOWED_USER_ID,text);}
 catch(e){console.error('alerta: falha ao enviar mensagem pro Telegram',e);}
}

async function allRows():Promise<RecordItem[]>{
 const r=await database().prepare('SELECT * FROM records').all();
 return r.results.map((row:any)=>({...row,data:JSON.parse(row.data)}));
}

function today():string{return new Date().toISOString().slice(0,10);}
function daysBetween(from:string,to:string):number{
 return Math.round((Date.parse(to+'T00:00:00Z')-Date.parse(from+'T00:00:00Z'))/86400000);
}

// ---- Alertas de evento (disparados na hora, a partir das rotas de API) ----

/** Arbitragem liquidada: todas as apostas saíram de "Pendente". */
export async function alertArbSettled(event:string,market:string,resultCents:number,extractionResultCents:number):Promise<void>{
 const positive=resultCents>=0;
 let text=`${positive?'✅':'🔻'} <b>Arbitragem liquidada</b>\n${esc(event)} · ${esc(market)}\nResultado: ${positive?'lucro':'prejuízo'} de ${money(Math.abs(resultCents))}`;
 if(extractionResultCents!==resultCents)text+=`\nExtração líquida (descontando perda anterior): ${money(extractionResultCents)}`;
 await notify(text);
}

/** Alavancagem: ciclo quebrou no Red. */
export async function alertAlavancagemRed(trackLabel:string,event:string):Promise<void>{
 await notify(`🔴 <b>Alavancagem — ciclo quebrou (Red)</b>\n${esc(trackLabel)} · ${esc(event)}`);
}

/** Alavancagem: ciclo completou (Green atingindo a meta do ciclo). */
export async function alertAlavancagemCycleComplete(trackLabel:string,event:string,prizeCents:number):Promise<void>{
 await notify(`🏁 <b>Alavancagem — ciclo completo!</b>\n${esc(trackLabel)} · ${esc(event)}\nPrêmio: ${money(prizeCents)}`);
}

/** ODD5 liquidado (Green ou Red). */
export async function alertOdd5Settled(event:string,result:'Green'|'Red',prizeCents:number):Promise<void>{
 const emoji=result==='Green'?'🟢':'🔴';
 await notify(`${emoji} <b>ODD5 liquidado</b>\n${esc(event)}\nResultado: ${result}${result==='Green'?` · Prêmio: ${money(prizeCents)}`:''}`);
}

// ---- Resumo diário (Cron Trigger, ver worker/index.ts) ----

/**
 * Roda 1x por dia (Cron Trigger, 12h de Brasília). Manda um resumo geral e,
 * juntos nele, os alertas que só fazem sentido checar periodicamente: saldo
 * baixo por conta/banco, saldo total geral baixo, arbitragem/comissão
 * pendente há alguns dias, e freebet perto de vencer.
 */
export async function runDailyChecks():Promise<void>{
 try{
  const rows=await allRows();
  const s=summary(rows);
  const banks=bankSummary(rows);
  const bankTotal=banks.banks.reduce((sum,b)=>sum+b.balance,0);
  const commissions=commissionSummary(rows);
  const t=today();
  const accountLabel=(id:string)=>{const a=rows.find(r=>r.kind==='account'&&r.id===id);return a?a.data.house+' · '+a.data.holder:id;};

  const lines:string[]=[];
  lines.push('📋 <b>Resumo diário</b>');
  lines.push('');
  lines.push(`💰 Saldo total geral: <b>${money(s.real+s.exposure+bankTotal)}</b>`);
  lines.push(`· Disponível para apostas: ${money(s.real)}`);
  lines.push(`· Em apostas abertas: ${money(s.exposure)}`);
  lines.push(`· Em bancos: ${money(bankTotal)}`);
  lines.push(`🎁 Freebets disponíveis: ${money(s.free)}`);
  lines.push(`📈 Resultado líquido: ${money(s.netProfit)}`);

  const lowAccounts=s.accounts.filter((a:any)=>a.real<LOW_BALANCE_THRESHOLD);
  const lowBanks=banks.banks.filter(b=>b.balance<LOW_BALANCE_THRESHOLD);
  if(lowAccounts.length||lowBanks.length){
   lines.push('');
   lines.push('⚠️ <b>Saldo baixo</b>');
   for(const a of lowAccounts)lines.push(`· ${esc(a.house)} · ${esc(a.holder)}: ${money(a.real)}`);
   for(const b of lowBanks)lines.push(`· Banco ${esc(b.bank)} · ${esc(b.holder)}: ${money(b.balance)}`);
  }

  if(s.real+s.exposure+bankTotal<LOW_TOTAL_THRESHOLD){
   lines.push('');
   lines.push(`🔻 Saldo total geral abaixo de ${money(LOW_TOTAL_THRESHOLD)}`);
  }

  const pendingArbs=s.arbs.filter((a:any)=>!a.betsDone&&daysBetween(a.date,t)>=PENDING_DAYS_THRESHOLD);
  const pendingCommissions:{name:string;days:number}[]=[];
  for(const p of commissions.people){
   if(p.balance<=0)continue;
   const lastComissao=rows.filter(r=>r.kind==='commission_entry'&&r.data.personId===p.id&&r.data.type==='Comissão').map(r=>r.data.date as string).sort().at(-1);
   if(!lastComissao)continue;
   const days=daysBetween(lastComissao,t);
   if(days>=PENDING_DAYS_THRESHOLD)pendingCommissions.push({name:p.name,days});
  }
  if(pendingArbs.length||pendingCommissions.length){
   lines.push('');
   lines.push('⏳ <b>Pendências</b>');
   for(const a of pendingArbs)lines.push(`· Arbitragem "${esc(a.event)}" pendente há ${daysBetween(a.date,t)} dias`);
   for(const c of pendingCommissions)lines.push(`· Comissão de ${esc(c.name)} pendente há ${c.days} dias`);
  }

  const expiring=s.grants.filter((g:any)=>!g.expired&&g.remaining>0&&g.expires&&daysBetween(t,g.expires)>=0&&daysBetween(t,g.expires)<=FREEBET_EXPIRY_DAYS_THRESHOLD);
  if(expiring.length){
   lines.push('');
   lines.push('🎟️ <b>Freebets vencendo</b>');
   for(const g of expiring)lines.push(`· ${esc(g.event||accountLabel(g.account))}: vence em ${daysBetween(t,g.expires)} dia(s) — ${money(g.remaining)}`);
  }

  await notify(lines.join('\n'));
 }catch(e){
  console.error('alerta: falha ao rodar o resumo diário',e);
 }
}
