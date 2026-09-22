// Resolves a parsed BotCommand against the current data (turning fuzzy
// spoken names into record ids) and, once confirmed, executes it by calling
// straight into the same route handlers the web UI uses — so every command
// the bot can run goes through the exact same Zod validation, optimistic
// concurrency checks and business rules as the app at "/".
import type {RecordItem} from './banca';
import {
 type BotCommand,toCents,todayISO,resolveAccount,resolveBank,resolvePerson,
 resolvePendingArb,resolveArbByEvent,resolveOdd5,leverageGroupOf,
 tipoMovLabel,tipoComissaoLabel,statusApostaLabel,resultadoLabel,
} from './bot-commands';
import {leverageEntries,nextLeverage} from './alavancagem';
import {POST as recordsPost,DELETE as recordsDelete} from '@/app/api/records/route';
import {POST as alavancagemPost} from '@/app/api/alavancagem/route';
import {POST as odd5Post} from '@/app/api/odd5/route';
import {POST as bankTxPost} from '@/app/api/bank-transactions/route';

export type Resolved=Record<string,string>;
export type ResolveResult={ok:true;resolved:Resolved;description:string}|{ok:false;error:string};

const statusMap:Record<string,string>={ganhou:'Ganhou',perdeu:'Perdeu',cancelada:'Cancelada',cashout:'Cashout',pendente:'Pendente'};
const tipoBancoMap:Record<string,string>={deposito:'deposit',saque:'withdraw',transferencia:'transfer'};

/** Turns spoken/typed names into record ids and builds the confirmation text. Never touches the database. */
export function resolveCommand(cmd:BotCommand,rows:RecordItem[]):ResolveResult{
 switch(cmd.acao){
  case 'criar_conta':
   return {ok:true,resolved:{},description:`Criar conta ${cmd.casa} · ${cmd.titular}, saldo inicial R$ ${cmd.saldoInicial.toFixed(2).replace('.',',')}${cmd.observacao?`. Obs: ${cmd.observacao}`:''}`};

  case 'criar_movimentacao':{
   const acc=resolveAccount(rows,cmd.conta);
   if(!acc)return {ok:false,error:`Não encontrei nenhuma conta parecida com "${cmd.conta}", ou o nome bate com mais de uma conta ao mesmo tempo. Diga o nome da casa junto com o titular (ex: "Pagolbet do Manel").`};
   return {ok:true,resolved:{accountId:acc.id},description:`${tipoMovLabel[cmd.tipo]} de R$ ${cmd.valor.toFixed(2).replace('.',',')} na conta ${acc.data.house} · ${acc.data.holder}${cmd.data?` — ${cmd.data}`:''}`};
  }

  case 'criar_banco':
   return {ok:true,resolved:{},description:`Criar banco ${cmd.banco} · ${cmd.titular}, saldo R$ ${cmd.saldo.toFixed(2).replace('.',',')}`};

  case 'transacao_bancaria':{
   const origem=resolveBank(rows,cmd.bancoOrigem);
   if(!origem)return {ok:false,error:`Não encontrei nenhum banco parecido com "${cmd.bancoOrigem}".`};
   const resolved:Resolved={bancoOrigemId:origem.id};
   let desc=`${cmd.tipo==='deposito'?'Depósito':cmd.tipo==='saque'?'Saque':'Transferência'} de R$ ${cmd.valor.toFixed(2).replace('.',',')} — origem: ${origem.data.bank} · ${origem.data.holder}`;
   if(cmd.tipo==='transferencia'){
    if(!cmd.bancoDestino)return {ok:false,error:'Não entendi qual o banco de destino da transferência.'};
    const destino=resolveBank(rows,cmd.bancoDestino);
    if(!destino)return {ok:false,error:`Não encontrei nenhum banco parecido com "${cmd.bancoDestino}".`};
    if(destino.id===origem.id)return {ok:false,error:'O banco de origem e o de destino ficaram iguais — confira os nomes.'};
    resolved.bancoDestinoId=destino.id;
    desc+=` → destino: ${destino.data.bank} · ${destino.data.holder}`;
   }
   return {ok:true,resolved,description:desc};
  }

  case 'criar_pessoa_comissao':
   return {ok:true,resolved:{},description:`Cadastrar pessoa em Comissões: ${cmd.nome}`};

  case 'criar_comissao':{
   const person=resolvePerson(rows,cmd.pessoa);
   if(!person)return {ok:false,error:`Não encontrei nenhuma pessoa parecida com "${cmd.pessoa}" em Comissões.`};
   return {ok:true,resolved:{personId:person.id},description:`${tipoComissaoLabel[cmd.tipo]} de R$ ${cmd.valor.toFixed(2).replace('.',',')} para ${person.data.name}${cmd.data?` — ${cmd.data}`:''}`};
  }

  case 'criar_arbitragem':{
   const resolved:Resolved={};
   const linhas:string[]=[];
   for(let i=0;i<cmd.apostas.length;i++){
    const a=cmd.apostas[i];
    const acc=resolveAccount(rows,a.conta);
    if(!acc)return {ok:false,error:`Não encontrei nenhuma conta parecida com "${a.conta}" (aposta ${i+1}), ou o nome bate com mais de uma conta. Diga o nome da casa junto com o titular.`};
    resolved['aposta'+i+'AccountId']=acc.id;
    linhas.push(`  • ${acc.data.house} · ${acc.data.holder}: R$ ${a.valor.toFixed(2).replace('.',',')} @ ${a.odd} (${statusApostaLabel[a.status]}${['ganhou','cashout'].includes(a.status)?`, retorno R$ ${(a.retorno||0).toFixed(2).replace('.',',')}`:''})`);
   }
   return {ok:true,resolved,description:`Criar arbitragem "${cmd.evento}" — ${cmd.mercado}${cmd.data?` — ${cmd.data}`:''}\n${linhas.join('\n')}`};
  }

  case 'liquidar_aposta_arbitragem':{
   const arb=resolvePendingArb(rows,cmd.evento);
   if(!arb)return {ok:false,error:`Não encontrei nenhuma arbitragem pendente parecida com "${cmd.evento}".`};
   const acc=resolveAccount(rows,cmd.conta);
   if(!acc)return {ok:false,error:`Não encontrei nenhuma conta parecida com "${cmd.conta}", ou o nome bate com mais de uma conta ao mesmo tempo. Diga o nome da casa junto com o titular (ex: "Pagolbet do Manel").`};
   const bet=arb.data.bets.find((b:any)=>b.account===acc.id&&b.status==='Pendente');
   if(!bet)return {ok:false,error:`Não encontrei uma aposta pendente na conta ${acc.data.house} · ${acc.data.holder} dentro de "${arb.data.event}".`};
   return {ok:true,resolved:{arbId:arb.id,accountId:acc.id},description:`Liquidar "${arb.data.event}" — ${acc.data.house} · ${acc.data.holder}: ${statusApostaLabel[cmd.status]}${['ganhou','cashout'].includes(cmd.status)?`, retorno R$ ${(cmd.retorno||0).toFixed(2).replace('.',',')}`:''}`};
  }

  case 'excluir_conta':{
   const acc=resolveAccount(rows,cmd.conta);
   if(!acc)return {ok:false,error:`Não encontrei nenhuma conta parecida com "${cmd.conta}", ou o nome bate com mais de uma conta ao mesmo tempo. Diga o nome da casa junto com o titular (ex: "Pagolbet do Manel").`};
   return {ok:true,resolved:{accountId:acc.id},description:`⚠️ Excluir a conta ${acc.data.house} · ${acc.data.holder}`};
  }

  case 'excluir_pessoa_comissao':{
   const person=resolvePerson(rows,cmd.pessoa);
   if(!person)return {ok:false,error:`Não encontrei nenhuma pessoa parecida com "${cmd.pessoa}" em Comissões.`};
   return {ok:true,resolved:{personId:person.id},description:`⚠️ Excluir a pessoa ${person.data.name} de Comissões`};
  }

  case 'excluir_arbitragem':{
   const arb=resolveArbByEvent(rows,cmd.evento);
   if(!arb)return {ok:false,error:`Não encontrei nenhuma arbitragem parecida com "${cmd.evento}".`};
   return {ok:true,resolved:{arbId:arb.id},description:`⚠️ Excluir a arbitragem "${arb.data.event}"`};
  }

  case 'alavancagem_criar':{
   const group=leverageGroupOf(cmd.grupo);
   const acc=resolveAccount(rows,cmd.conta);
   if(!acc)return {ok:false,error:`Não encontrei nenhuma conta parecida com "${cmd.conta}", ou o nome bate com mais de uma conta ao mesmo tempo. Diga o nome da casa junto com o titular (ex: "Pagolbet do Manel").`};
   let seq:number;
   try{seq=nextLeverage(rows,group).sequence;}catch(e){return {ok:false,error:e instanceof Error?e.message:'Não foi possível calcular a próxima entrada.'};}
   return {ok:true,resolved:{accountId:acc.id,expectedSequence:String(seq)},description:`Criar entrada na Alavancagem ${cmd.grupo} (nº ${seq}) — ${cmd.evento} — ${cmd.mercado} — odd ${cmd.odd} — conta ${acc.data.house} · ${acc.data.holder}`};
  }

  case 'alavancagem_liquidar':{
   const group=leverageGroupOf(cmd.grupo);
   const pending=leverageEntries(rows,group).find(e=>e.data.result==='Pendente');
   if(!pending)return {ok:false,error:`Não há entrada pendente na Alavancagem ${cmd.grupo}.`};
   return {ok:true,resolved:{},description:`Liquidar Alavancagem ${cmd.grupo} (nº ${pending.data.sequence}, ${pending.data.event}) como ${resultadoLabel[cmd.resultado]}`};
  }

  case 'alavancagem_excluir':{
   const group=leverageGroupOf(cmd.grupo);
   const pending=leverageEntries(rows,group).find(e=>e.data.result==='Pendente');
   if(!pending)return {ok:false,error:`Não há entrada pendente na Alavancagem ${cmd.grupo} para excluir.`};
   return {ok:true,resolved:{},description:`⚠️ Excluir a entrada pendente nº ${pending.data.sequence} da Alavancagem ${cmd.grupo} (${pending.data.event})`};
  }

  case 'odd5_criar':{
   const acc=resolveAccount(rows,cmd.conta);
   if(!acc)return {ok:false,error:`Não encontrei nenhuma conta parecida com "${cmd.conta}", ou o nome bate com mais de uma conta ao mesmo tempo. Diga o nome da casa junto com o titular (ex: "Pagolbet do Manel").`};
   return {ok:true,resolved:{accountId:acc.id},description:`Criar ODD5 "${cmd.evento}" — ${cmd.mercados.join(' | ')} — odd ${cmd.odd} — stake R$ ${cmd.valor.toFixed(2).replace('.',',')} — conta ${acc.data.house} · ${acc.data.holder}`};
  }

  case 'odd5_liquidar':{
   const entry=resolveOdd5(rows,cmd.evento,true);
   if(!entry)return {ok:false,error:`Não encontrei nenhum ODD5 pendente parecido com "${cmd.evento}".`};
   return {ok:true,resolved:{odd5Id:entry.id},description:`Liquidar ODD5 "${entry.data.event}" como ${resultadoLabel[cmd.resultado]}`};
  }

  case 'odd5_excluir':{
   const entry=resolveOdd5(rows,cmd.evento,false);
   if(!entry)return {ok:false,error:`Não encontrei nenhum ODD5 parecido com "${cmd.evento}".`};
   return {ok:true,resolved:{odd5Id:entry.id},description:`⚠️ Excluir o ODD5 "${entry.data.event}"`};
  }

  case 'nao_entendi':
   return {ok:false,error:'Não entendi o que você quer fazer. Pode repetir de outro jeito, com o valor em reais e o nome da conta/casa?'};
 }
}

async function callHandler(handler:(req:Request)=>Promise<Response>,origin:string,path:string,method:string,body:unknown):Promise<{ok:boolean;json:any}>{
 const req=new Request(origin+path,{method,headers:{'content-type':'application/json',origin},body:JSON.stringify(body)});
 const res=await handler(req);
 const json:any=await res.json().catch(()=>({}));
 return {ok:res.ok,json};
}

/** Re-fetches current rows and actually performs the confirmed action, via the same route handlers the web UI calls. */
export async function executeCommand(cmd:BotCommand,resolved:Resolved,rows:RecordItem[],origin:string):Promise<{ok:boolean;text:string}>{
 try{
  switch(cmd.acao){
   case 'criar_conta':{
    const r=await callHandler(recordsPost,origin,'/api/records','POST',{kind:'account',data:{house:cmd.casa,holder:cmd.titular,initial:toCents(cmd.saldoInicial),note:cmd.observacao||''}});
    return r.ok?{ok:true,text:`✅ Conta ${cmd.casa} · ${cmd.titular} criada.`}:{ok:false,text:'❌ '+(r.json.error||'Não foi possível criar a conta.')};
   }
   case 'criar_movimentacao':{
    const acc=rows.find(r=>r.id===resolved.accountId);
    if(!acc)return {ok:false,text:'❌ Essa conta não existe mais. Sincronize e tente de novo.'};
    const r=await callHandler(recordsPost,origin,'/api/records','POST',{kind:'movement',data:{account:resolved.accountId,type:tipoMovLabel[cmd.tipo],amount:toCents(cmd.valor),date:cmd.data||todayISO(),note:cmd.observacao||''}});
    return r.ok?{ok:true,text:`✅ ${tipoMovLabel[cmd.tipo]} de R$ ${cmd.valor.toFixed(2).replace('.',',')} lançado em ${acc.data.house} · ${acc.data.holder}.`+(r.json.warning?`\n⚠️ ${r.json.warning}`:'')}:{ok:false,text:'❌ '+(r.json.error||'Não foi possível lançar a movimentação.')};
   }
   case 'criar_banco':{
    const r=await callHandler(recordsPost,origin,'/api/records','POST',{kind:'bank',data:{bank:cmd.banco,holder:cmd.titular,balance:toCents(cmd.saldo),note:cmd.observacao||''}});
    return r.ok?{ok:true,text:`✅ Banco ${cmd.banco} · ${cmd.titular} criado.`}:{ok:false,text:'❌ '+(r.json.error||'Não foi possível criar o banco.')};
   }
   case 'transacao_bancaria':{
    const origemRow=rows.find(r=>r.id===resolved.bancoOrigemId);
    if(!origemRow)return {ok:false,text:'❌ Esse banco não existe mais. Sincronize e tente de novo.'};
    const body:any={type:tipoBancoMap[cmd.tipo],source:resolved.bancoOrigemId,sourceRevision:origemRow.revision,amount:toCents(cmd.valor)};
    if(cmd.tipo==='transferencia'){
     const destRow=rows.find(r=>r.id===resolved.bancoDestinoId);
     if(!destRow)return {ok:false,text:'❌ O banco de destino não existe mais. Sincronize e tente de novo.'};
     body.destination=resolved.bancoDestinoId;body.destinationRevision=destRow.revision;
    }
    const r=await callHandler(bankTxPost,origin,'/api/bank-transactions','POST',body);
    return r.ok?{ok:true,text:'✅ Operação bancária registrada.'}:{ok:false,text:'❌ '+(r.json.error||'Não foi possível registrar a operação.')};
   }
   case 'criar_pessoa_comissao':{
    const r=await callHandler(recordsPost,origin,'/api/records','POST',{kind:'commission_person',data:{name:cmd.nome,note:cmd.observacao||''}});
    return r.ok?{ok:true,text:`✅ ${cmd.nome} cadastrado(a) em Comissões.`}:{ok:false,text:'❌ '+(r.json.error||'Não foi possível cadastrar.')};
   }
   case 'criar_comissao':{
    const person=rows.find(r=>r.id===resolved.personId);
    if(!person)return {ok:false,text:'❌ Essa pessoa não existe mais. Sincronize e tente de novo.'};
    const r=await callHandler(recordsPost,origin,'/api/records','POST',{kind:'commission_entry',data:{personId:resolved.personId,type:tipoComissaoLabel[cmd.tipo],amount:toCents(cmd.valor),date:cmd.data||todayISO(),note:cmd.observacao||''}});
    return r.ok?{ok:true,text:`✅ ${tipoComissaoLabel[cmd.tipo]} de R$ ${cmd.valor.toFixed(2).replace('.',',')} lançada para ${person.data.name}.`}:{ok:false,text:'❌ '+(r.json.error||'Não foi possível lançar.')};
   }
   case 'criar_arbitragem':{
    const bets=[];
    for(let i=0;i<cmd.apostas.length;i++){
     const a=cmd.apostas[i];
     const accountId=resolved['aposta'+i+'AccountId'];
     if(!rows.some(r=>r.id===accountId))return {ok:false,text:'❌ Uma das contas dessa arbitragem não existe mais. Sincronize e tente de novo.'};
     bets.push({id:crypto.randomUUID(),account:accountId,selection:cmd.mercado,capital:'Real',stake:toCents(a.valor),odd:a.odd,status:statusMap[a.status],returned:['ganhou','cashout'].includes(a.status)?toCents(a.retorno||0):0});
    }
    const r=await callHandler(recordsPost,origin,'/api/records','POST',{kind:'arb',data:{event:cmd.evento,market:cmd.mercado,date:cmd.data||todayISO(),note:cmd.observacao||'',bets}});
    return r.ok?{ok:true,text:`✅ Arbitragem "${cmd.evento}" criada com ${bets.length} apostas.`}:{ok:false,text:'❌ '+(r.json.error||'Não foi possível criar a arbitragem.')};
   }
   case 'liquidar_aposta_arbitragem':{
    const arb=rows.find(r=>r.id===resolved.arbId&&r.kind==='arb');
    if(!arb)return {ok:false,text:'❌ Essa arbitragem não existe mais. Sincronize e tente de novo.'};
    const bets=arb.data.bets.map((b:any)=>b.account===resolved.accountId&&b.status==='Pendente'
     ?{...b,status:statusMap[cmd.status],returned:['ganhou','cashout'].includes(cmd.status)?toCents(cmd.retorno||0):0}
     :b);
    if(JSON.stringify(bets)===JSON.stringify(arb.data.bets))return {ok:false,text:'❌ Essa aposta já não está mais pendente. Sincronize e confira.'};
    const data={...arb.data,bets};
    const r=await callHandler(recordsPost,origin,'/api/records','POST',{kind:'arb',id:arb.id,revision:arb.revision,data});
    return r.ok?{ok:true,text:`✅ "${arb.data.event}" liquidada como ${statusApostaLabel[cmd.status]}.`}:{ok:false,text:'❌ '+(r.json.error||'Não foi possível liquidar.')};
   }
   case 'excluir_conta':{
    const acc=rows.find(r=>r.id===resolved.accountId);
    if(!acc)return {ok:false,text:'❌ Essa conta não existe mais.'};
    const r=await callHandler(recordsDelete,origin,'/api/records','DELETE',{id:acc.id,revision:acc.revision});
    return r.ok?{ok:true,text:`✅ Conta ${acc.data.house} · ${acc.data.holder} excluída.`}:{ok:false,text:'❌ '+(r.json.error||'Não foi possível excluir.')};
   }
   case 'excluir_pessoa_comissao':{
    const person=rows.find(r=>r.id===resolved.personId);
    if(!person)return {ok:false,text:'❌ Essa pessoa não existe mais.'};
    const r=await callHandler(recordsDelete,origin,'/api/records','DELETE',{id:person.id,revision:person.revision});
    return r.ok?{ok:true,text:`✅ ${person.data.name} excluído(a) de Comissões.`}:{ok:false,text:'❌ '+(r.json.error||'Não foi possível excluir.')};
   }
   case 'excluir_arbitragem':{
    const arb=rows.find(r=>r.id===resolved.arbId);
    if(!arb)return {ok:false,text:'❌ Essa arbitragem não existe mais.'};
    const r=await callHandler(recordsDelete,origin,'/api/records','DELETE',{id:arb.id,revision:arb.revision});
    return r.ok?{ok:true,text:`✅ Arbitragem "${arb.data.event}" excluída.`}:{ok:false,text:'❌ '+(r.json.error||'Não foi possível excluir.')};
   }
   case 'alavancagem_criar':{
    const group=leverageGroupOf(cmd.grupo);
    const acc=rows.find(r=>r.id===resolved.accountId);
    if(!acc)return {ok:false,text:'❌ Essa conta não existe mais. Sincronize e tente de novo.'};
    let seq:number;
    try{seq=nextLeverage(rows,group).sequence;}catch(e){return {ok:false,text:'❌ '+(e instanceof Error?e.message:'Não foi possível registrar.')};}
    const r=await callHandler(alavancagemPost,origin,'/api/alavancagem','POST',{action:'create',group,event:cmd.evento,date:cmd.data||todayISO(),odd:cmd.odd,market:cmd.mercado,account:acc.data.holder,house:acc.data.house,accountId:acc.id,expectedSequence:seq});
    return r.ok?{ok:true,text:`✅ Entrada criada na Alavancagem ${cmd.grupo}.`}:{ok:false,text:'❌ '+(r.json.error||'Não foi possível registrar.')};
   }
   case 'alavancagem_liquidar':{
    const group=leverageGroupOf(cmd.grupo);
    const pending=leverageEntries(rows,group).find(e=>e.data.result==='Pendente');
    if(!pending)return {ok:false,text:`❌ Não há mais entrada pendente na Alavancagem ${cmd.grupo}.`};
    const r=await callHandler(alavancagemPost,origin,'/api/alavancagem','POST',{action:'settle',group,id:pending.id,revision:pending.revision,result:resultadoLabel[cmd.resultado]});
    return r.ok?{ok:true,text:`✅ Alavancagem ${cmd.grupo} liquidada como ${resultadoLabel[cmd.resultado]}.`}:{ok:false,text:'❌ '+(r.json.error||'Não foi possível liquidar.')};
   }
   case 'alavancagem_excluir':{
    const group=leverageGroupOf(cmd.grupo);
    const pending=leverageEntries(rows,group).find(e=>e.data.result==='Pendente');
    if(!pending)return {ok:false,text:`❌ Não há mais entrada pendente na Alavancagem ${cmd.grupo}.`};
    const r=await callHandler(alavancagemPost,origin,'/api/alavancagem','POST',{action:'delete',group,id:pending.id,revision:pending.revision});
    return r.ok?{ok:true,text:`✅ Entrada da Alavancagem ${cmd.grupo} excluída.`}:{ok:false,text:'❌ '+(r.json.error||'Não foi possível excluir.')};
   }
   case 'odd5_criar':{
    const acc=rows.find(r=>r.id===resolved.accountId);
    if(!acc)return {ok:false,text:'❌ Essa conta não existe mais. Sincronize e tente de novo.'};
    const r=await callHandler(odd5Post,origin,'/api/odd5','POST',{action:'create',event:cmd.evento,markets:cmd.mercados,odd:cmd.odd,stake:toCents(cmd.valor),accountId:acc.id});
    return r.ok?{ok:true,text:`✅ ODD5 "${cmd.evento}" criado.`}:{ok:false,text:'❌ '+(r.json.error||'Não foi possível criar.')};
   }
   case 'odd5_liquidar':{
    const entry=rows.find(r=>r.id===resolved.odd5Id);
    if(!entry)return {ok:false,text:'❌ Esse ODD5 não existe mais.'};
    const r=await callHandler(odd5Post,origin,'/api/odd5','POST',{action:'settle',id:entry.id,revision:entry.revision,result:resultadoLabel[cmd.resultado]});
    return r.ok?{ok:true,text:`✅ ODD5 "${entry.data.event}" liquidado como ${resultadoLabel[cmd.resultado]}.`}:{ok:false,text:'❌ '+(r.json.error||'Não foi possível liquidar.')};
   }
   case 'odd5_excluir':{
    const entry=rows.find(r=>r.id===resolved.odd5Id);
    if(!entry)return {ok:false,text:'❌ Esse ODD5 não existe mais.'};
    const r=await callHandler(odd5Post,origin,'/api/odd5','POST',{action:'delete',id:entry.id,revision:entry.revision});
    return r.ok?{ok:true,text:`✅ ODD5 "${entry.data.event}" excluído.`}:{ok:false,text:'❌ '+(r.json.error||'Não foi possível excluir.')};
   }
   case 'nao_entendi':
    return {ok:false,text:'❌ Não entendi o comando.'};
  }
 }catch(e){
  console.error('bot execute error',cmd.acao,e);
  return {ok:false,text:'❌ Ocorreu um erro inesperado ao executar. Tente de novo.'};
 }
}
