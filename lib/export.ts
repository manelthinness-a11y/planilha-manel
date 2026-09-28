import type {RecordItem} from './banca';
import {TRACKS} from './alavancagem';

// Exportação dos dados: backup completo (JSON, com tudo o que está no banco)
// e planilha (CSV no padrão do Excel em português: ponto e vírgula, vírgula
// decimal, datas dd/mm/aaaa, uma linha por registro — na arbitragem, uma linha
// por aposta).

export const CSV_COLUMNS=['Origem','Data','Pessoa','Casa','Descrição','Mercado / Seleção','Capital','Stake (R$)','Odd','Situação','Resultado (R$)','Observação','ID'] as const;

const dateBR=(d?:string)=>d?d.split('-').reverse().join('/'):'';
const brl=(cents:number|null|undefined)=>cents===null||cents===undefined?'':(cents/100).toFixed(2).replace('.',',');
const oddBR=(odd:number|null|undefined)=>odd?Number(odd).toFixed(2).replace('.',','):'';

/** Uma linha da planilha, já com os valores prontos para o Excel. */
export type CsvRow=Record<(typeof CSV_COLUMNS)[number],string>;

export function exportRows(rows:RecordItem[]):CsvRow[]{
 const accounts=new Map(rows.filter(r=>r.kind==='account').map(r=>[r.id,r.data]));
 const people=new Map(rows.filter(r=>r.kind==='commission_person').map(r=>[r.id,r.data]));
 const acc=(id:string)=>accounts.get(id)||{holder:'',house:'(conta removida)'};
 const entryAcc=(d:any)=>d.accountId&&accounts.has(d.accountId)?acc(d.accountId):{holder:d.account||'',house:d.house||''};
 const line=(partial:Partial<CsvRow>):CsvRow=>Object.fromEntries(CSV_COLUMNS.map(c=>[c,partial[c]??'']))as CsvRow;
 const settled=(result:string,stake:number,prize:number)=>result==='Green'?prize-stake:result==='Red'?-stake:null;
 const out:CsvRow[]=[];
 for(const r of rows){
  const d=r.data;
  switch(r.kind){
   case 'account':out.push(line({Origem:'Conta',Pessoa:d.holder,Casa:d.house,Descrição:'Saldo inicial',['Resultado (R$)']:brl(d.initial),Observação:d.note||'',ID:r.id}));break;
   case 'bank':out.push(line({Origem:'Banco',Pessoa:d.holder,Casa:d.bank,Descrição:'Saldo',['Resultado (R$)']:brl(d.balance),Observação:d.note||'',ID:r.id}));break;
   case 'movement':{const a=acc(d.account);out.push(line({Origem:'Movimentação',Data:dateBR(d.date),Pessoa:a.holder,Casa:a.house,Descrição:d.type,['Resultado (R$)']:brl(d.type==='Saque'||d.type==='Ajuste negativo'?-d.amount:d.amount),Observação:[d.note,d.expires?'vence '+dateBR(d.expires):''].filter(Boolean).join(' · '),ID:r.id}));break;}
   case 'arb':{
    for(const b of d.bets||[]){
     const a=acc(b.account);const real=b.capital!=='Freebet';
     const ret=b.status==='Ganhou'||b.status==='Cashout'?b.returned||0:b.status==='Cancelada'&&real?b.stake:0;
     out.push(line({Origem:'Arbitragem',Data:dateBR(d.date),Pessoa:a.holder,Casa:a.house,Descrição:d.event,['Mercado / Seleção']:b.selection||d.market||'',Capital:b.capital||'Real',['Stake (R$)']:brl(b.stake),Odd:oddBR(b.odd),Situação:b.status,['Resultado (R$)']:b.status==='Pendente'?'':brl(ret-(real?b.stake:0)),Observação:[d.note,b.previousLoss?'perda anterior '+brl(b.previousLoss):''].filter(Boolean).join(' · '),ID:r.id}));
    }
    if(d.promo){const a=acc(d.promo.account);out.push(line({Origem:'Freebet esperada',Data:dateBR(d.promo.receivedDate||d.date),Pessoa:a.holder,Casa:a.house,Descrição:d.event,Situação:d.promo.status,['Resultado (R$)']:brl(d.promo.status==='Recebida'?d.promo.received:d.promo.expected),Observação:[d.promo.condition,d.promo.expires?'vence '+dateBR(d.promo.expires):''].filter(Boolean).join(' · '),ID:r.id}));}
    break;
   }
   case 'alavancagem':{
    const a=entryAcc(d);const group=d.group??'alavancagem';const track=TRACKS.find(t=>t.mainGroup===group||t.individualGroup===group);
    out.push(line({Origem:(track?.label||'Alavancagem')+(track&&track.individualGroup===group?' · Individual':''),Data:dateBR(d.date),Pessoa:a.holder,Casa:a.house,Descrição:d.event,['Mercado / Seleção']:d.market||'',Capital:'Real',['Stake (R$)']:brl(d.stake),Odd:oddBR(d.odd),Situação:d.result,['Resultado (R$)']:brl(settled(d.result,d.stake||0,d.prize||0)),Observação:'ciclo '+(d.cycle??'')+' · entrada '+(d.sequence??''),ID:r.id}));
    break;
   }
   case 'odd5':case 'camilo':case 'avulsa':{
    const a=entryAcc(d);const origin=r.kind==='odd5'?'ODD 5':r.kind==='camilo'?'Camilo':'Entrada avulsa';
    out.push(line({Origem:origin,Data:dateBR(d.date),Pessoa:a.holder,Casa:a.house,Descrição:d.event,['Mercado / Seleção']:(d.markets||[]).join(' · '),Capital:'Real',['Stake (R$)']:brl(d.stake),Odd:oddBR(d.odd),Situação:d.result,['Resultado (R$)']:brl(settled(d.result,d.stake||0,d.prize||0)),ID:r.id}));
    break;
   }
   case 'cassino':{const a=entryAcc(d);out.push(line({Origem:'Cassino',Data:dateBR(d.date),Pessoa:a.holder,Casa:a.house,Descrição:d.type,Situação:d.type,['Resultado (R$)']:brl(d.type==='Ganho'?d.amount:-d.amount),Observação:d.note||'',ID:r.id}));break;}
   case 'commission_person':out.push(line({Origem:'Pessoa (comissões)',Pessoa:d.name,Observação:d.note||'',ID:r.id}));break;
   case 'commission_entry':{const p=people.get(d.personId);out.push(line({Origem:'Comissão',Data:dateBR(d.date),Pessoa:p?.name||'(pessoa removida)',Descrição:d.type,['Resultado (R$)']:brl(d.type==='Comissão'?d.amount:-d.amount),Observação:d.note||'',ID:r.id}));break;}
   default:break; // configurações internas (stake padrão etc.) não vão para a planilha
  }
 }
 const order:Record<string,number>={Conta:0,Banco:1};
 return out.sort((x,y)=>(order[x.Origem]??2)-(order[y.Origem]??2)||(y.Data.split('/').reverse().join('')).localeCompare(x.Data.split('/').reverse().join('')));
}

const csvCell=(v:string)=>/[;"\n\r]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;

/** Conteúdo do arquivo .csv (com BOM para o Excel reconhecer acentos). */
export function exportCsv(rows:RecordItem[]):string{
 const lines=[CSV_COLUMNS.join(';'),...exportRows(rows).map(r=>CSV_COLUMNS.map(c=>csvCell(r[c])).join(';'))];
 return '﻿'+lines.join('\r\n')+'\r\n';
}

/** Conteúdo do backup .json: todos os registros exatamente como estão no banco. */
export function exportJson(rows:RecordItem[],exportedAt=new Date()):string{
 return JSON.stringify({app:'planilha-manel',exportedAt:exportedAt.toISOString(),records:rows.length,rows},null,1);
}

export const exportFileName=(ext:'csv'|'json',now=new Date())=>'planilha-manel-'+[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-')+'.'+ext;
