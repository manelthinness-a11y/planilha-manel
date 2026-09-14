import {marketOptions, selectionOptions} from './markets';

export type VoiceAccount = {id:string; house:string; holder:string};
export type VoiceBet = {account:string; selection:string; stake:number; odd:number; capital:'Real'|'Freebet'; previousLoss:number};
export type VoiceArbitrage = {event:string; market:string; bets:VoiceBet[]; warnings:string[]};
const normalize = (value:string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[ºª]/g,'').trim();
const numbers:Record<string,number> = {zero:0,um:1,uma:1,dois:2,duas:2,tres:3,quatro:4,cinco:5,seis:6,sete:7,oito:8,nove:9,dez:10,onze:11,doze:12,treze:13,catorze:14,quatorze:14,quinze:15,dezesseis:16,dezasseis:16,dezessete:17,dezoito:18,dezenove:19,vinte:20,trinta:30,quarenta:40,cinquenta:50,sessenta:60,setenta:70,oitenta:80,noventa:90,cem:100,cento:100,duzentos:200,trezentos:300,quatrocentos:400,quinhentos:500,seiscentos:600,setecentos:700,oitocentos:800,novecentos:900};
function integer(text:string):number|null {
 const tokens=text.trim().split(/\s+/).filter(t=>t!=='e');
 if(!tokens.length)return null;
 if(tokens.every(t=>/^[0-9]$/.test(t)))return Number(tokens.join(''));
 let total=0,part=0;
 for(const token of tokens){if(token==='mil'){total+=(part||1)*1000;part=0;}else if(Object.hasOwn(numbers,token))part+=numbers[token];else if(/^\d+$/.test(token))part+=Number(token);else return null;}
 return total+part;
}
/** Read one spoken numeric prefix; reject missing and negative values. No locale-dependent parseFloat. */
export function spokenNumber(text:string):number|null {
 let value=normalize(text).replace(/^[:=\s]+/,'').replace(/^r\$\s*/,'');
 if(/^(?:menos|-)/.test(value))return null;
 const wordPattern=Object.keys(numbers).join('|');
 const prefix=value.match(new RegExp(`^(?:[0-9]+(?:[.,][0-9]+)*|${wordPattern}|mil)(?:\\s+(?:${wordPattern}|mil|e|virgula|ponto|reais|real|centavos?|[0-9]+(?:[.,][0-9]+)*))*\\b`))?.[0];
 if(!prefix)return null;
 value=prefix.replace(/\s+e\s*$/,'').trim();
 const currency=value.match(/^(.*?)\s+(?:reais|real)(?:\s+e\s+(.+?)\s+centavos?)?$/);
 if(currency){const whole=/^\d{1,3}(?:\.\d{3})+$/.test(currency[1])?Number(currency[1].replace(/\./g,'')):spokenNumber(currency[1]);const cents=currency[2]?integer(currency[2]):0;return whole!==null&&cents!==null&&cents<100?whole+cents/100:null;}
 value=value.replace(/\s+centavos?$/,'');
 const decimal=value.split(/\s+(?:virgula|ponto)\s+/);
 if(decimal.length===2){const whole=integer(decimal[0]);const parts=decimal[1].split(/\s+/).filter(t=>t!=='e');const digits=parts.every(t=>/^[0-9]$/.test(t)||(numbers[t]!==undefined&&numbers[t]<10))?parts.map(t=>numbers[t]??t).join(''):String(integer(decimal[1])??'');return whole!==null&&/^\d{1,4}$/.test(digits)?Number(whole+'.'+digits):null;}
 if(/^[0-9]+(?:[.,][0-9]+)*$/.test(value)){
  if(value.includes(','))return /^\d{1,3}(?:\.\d{3})*,\d+$|^\d+,\d+$/.test(value)?Number(value.replace(/\./g,'').replace(',','.')):null;
  if((value.match(/\./g)||[]).length>1)return /^\d{1,3}(?:\.\d{3})+$/.test(value)?Number(value.replace(/\./g,'')):null;
  return Number(value);
 }
 return integer(value);
}
function moneyNumber(text:string):number|null {const n=normalize(text).replace(/^r\$\s*/,'');return /^\d{1,3}(?:\.\d{3})+$/.test(n)?Number(n.replace(/\./g,'')):spokenNumber(text);}
const fieldLabels='evento|jogo|mercado|conta|titular|pessoa|selecao|valor(?: apostado)?|odd[s]?|ode|cotacao|capital|perda anterior|observacao';
function field(text:string,label:string):string {
 const match=new RegExp(`\\b(?:${label})\\s*[:=]?\\s*(?:de\\s+)?([\\s\\S]*?)(?=\\b(?:${fieldLabels})\\b|$)`,'i').exec(text);
 return match?.[1].replace(/^[\s,:;.]+|[\s,:;.]+$/g,'').trim()||'';
}
function canonical(value:string):string {return normalize(value).replace(/bet\s*(?:tres\s+seis\s+cinco|trezentos\s+e?\s*sessenta\s+e?\s*cinco|365)/g,'bet365').replace(/\b365\b/g,'bet365').replace(/[^a-z0-9]+/g,' ').trim();}
function containsWords(text:string,value:string):boolean {return (' '+text+' ').includes(' '+value+' ');}
function matchAccount(text:string,accounts:VoiceAccount[]):string {
 const source=canonical(text);
 const candidates=accounts.filter(a=>containsWords(source,canonical(a.house))&&containsWords(source,canonical(a.holder)));
 // Require house AND holder. Never guess between different people's bankrolls.
 return candidates.length===1?candidates[0].id:'';
}
function marketFrom(text:string):string {
 const n=normalize(text);
 const exact=marketOptions.find(m=>normalize(m)===n);
 if(exact)return exact;
 const period=/primeiro|1(?:o)?\s*tempo/.test(n)?' — 1º tempo':/segundo|2(?:o)?\s*tempo/.test(n)?' — 2º tempo':'';
 if(/criar aposta|combinad/.test(n))return 'Criar aposta';
 if(/ambas.*marcam/.test(n))return 'Ambas marcam';
 if(/escanteio/.test(n))return /total/.test(n)?'Total de escanteios'+period:'Escanteios — Casa / Empate / Fora';
 if(/gol|gols/.test(n))return 'Total de gols'+period;
 if(/resultado final|vencedor/.test(n))return 'Resultado final';
 return text.trim();
}
function selectionFrom(text:string,market:string):string {
 const n=normalize(text);
 const exact=selectionOptions(market).find(s=>normalize(s)===n);
 if(exact)return exact;
 if(market==='Resultado final'||market==='Escanteios — Casa / Empate / Fora'){
  if(/\bempate\b/.test(n))return 'Empate';
  if(/\bfora\b|visitante/.test(n))return 'Fora';
  if(/\bcasa\b|mandante/.test(n))return 'Casa';
 }
 if(market==='Ambas marcam'){if(/\bnao\b/.test(n))return 'Não';if(/\bsim\b|ambas marcam/.test(n))return 'Sim';}
 const total=n.match(/\b(mais|menos)\s*(?:de\s+)?(.+)/);
 if(total){const amount=spokenNumber(total[2]);if(amount!==null)return (total[1]==='mais'?'Mais':'Menos')+' de '+amount.toLocaleString('pt-BR')+' '+(market.includes('escanteios')?'escanteios':'gols');}
 return text.trim();
}

export function parseVoiceArbitrage(transcript:string,accounts:VoiceAccount[]):VoiceArbitrage {
 const source=transcript.trim().slice(0,12000);
 // Normalization preserves character positions for accented Portuguese text used below.
 const markers=[...source.matchAll(/\b(?:(?:primeira|segunda|terceira|quarta|quinta|sexta|outra|nova|pr[oó]xima)\s+aposta|aposta\s+(?:n[uú]mero\s+)?(?:\d{1,2}|um|uma|dois|duas|tr[eê]s|quatro|cinco|seis))\b/gi)];
 const warnings:string[]=[];
 const head=source.slice(0,markers[0]?.index??source.length);
 const normalizedHead=normalize(head);
 const eventMatch=new RegExp(`\\b(?:evento|jogo)\\s*[:=]?\\s*([\\s\\S]*?)(?=\\b(?:mercado|data)\\b|$)`,'i').exec(head);
 const event=(eventMatch?.[1]||head.replace(/^nova arbitragem\s*[:,.]?\s*/i,'').split(/\bmercado\b/i)[0]).trim().replace(/[.,;:\s]+$/,'').replace(/\b(?:contra|versus)\b/ig,'x');
 const market=marketFrom(field(normalizedHead,'mercado'));
 const bets:VoiceBet[]=markers.slice(0,60).map((marker,index)=>{
  const text=normalize(source.slice(marker.index!+marker[0].length,markers[index+1]?.index??source.length));
  const account=matchAccount(field(text,'conta')||text,accounts);
  const capital:'Real'|'Freebet'=/\b(?:free\s*bet|freebet|aposta gratis|aposta gratuita)\b/.test(text)?'Freebet':'Real';
  let rawStake=field(text,'valor(?: apostado)?');
  if(!rawStake){const amount=text.match(/\b(?:aposte|apostei|apostar|coloque|colocar)\s+(.+)/);rawStake=amount?.[1]||'';}
  const readStake=moneyNumber(rawStake);
  const readOdd=spokenNumber(field(text,'odd[s]?|ode|cotacao'));
  const stake=readStake!==null&&Number.isFinite(readStake)&&readStake<=100000000?readStake:null;
  const odd=readOdd!==null&&Number.isFinite(readOdd)&&readOdd<=10000?readOdd:null;
  const rawLoss=field(text,'perda anterior');
  const readLoss=rawLoss?moneyNumber(rawLoss):0;
  const loss=readLoss!==null&&Number.isFinite(readLoss)&&readLoss<=100000000?readLoss:null;
  const selection=selectionFrom(field(text,'selecao'),market);
  if(!account)warnings.push(`Aposta ${index+1}: selecione a conta; diga a casa e o titular como estão cadastrados.`);
  if(stake===null||stake<=0)warnings.push(`Aposta ${index+1}: confira o valor apostado.`);
  if(odd===null||odd<1)warnings.push(`Aposta ${index+1}: confira a odd.`);
  if(!selection)warnings.push(`Aposta ${index+1}: preencha a seleção.`);
  if(loss===null)warnings.push(`Aposta ${index+1}: confira a perda anterior.`);
  if(capital==='Freebet')warnings.push(`Aposta ${index+1}: selecione a freebet recebida no formulário.`);
  return {account,capital,selection,stake:Math.round((stake??0)*100),odd:odd??0,previousLoss:capital==='Freebet'?Math.round((loss??0)*100):0};
 });
 if(!markers.length)warnings.push('Diga “aposta 1”, “aposta 2” e os dados de cada uma.');
 if(markers.length>60)warnings.push('São permitidas até 60 apostas por operação. Divida o comando em operações menores.');
 if(!event)warnings.push('Preencha o evento.');
 if(!market)warnings.push('Preencha o mercado.');
 if(bets.length<2)warnings.push('A arbitragem precisa de pelo menos duas apostas.');
 if(market==='Criar aposta')warnings.push('Confira e complete as seleções de cada combinação no formulário.');
 return {event,market,bets,warnings};
}
