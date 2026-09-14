const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const ts=require('typescript');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'manel-voice-'));
try {
 for(const name of ['markets','voice-arbitrage'])fs.writeFileSync(path.join(temporary,name+'.js'),ts.transpileModule(fs.readFileSync(path.join(__dirname,'../lib',name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText);
 const {parseVoiceArbitrage:parse,spokenNumber:number}=require(path.join(temporary,'voice-arbitrage.js'));
 for(const [text,expected] of [['cem reais',100],['duzentos e cinquenta',250],['dois vírgula dez',2.1],['dois vírgula zero cinco',2.05],['dois ponto cinco',2.5],['1.234,56',1234.56],['223,60',223.6],['mil duzentos e trinta e quatro reais e cinquenta centavos',1234.5],['menos quarenta',null],['não informado',null],['0',0]])assert.equal(number(text),expected,text);
 const accounts=[{id:'a',house:'Bet365',holder:'Manel'},{id:'b',house:'Betano',holder:'Alex'},{id:'c',house:'Bet365',holder:'Alex'}];
 const result=parse('Evento Flamengo contra Corinthians. Mercado resultado final. Aposta 1, conta Bet365 Manel, seleção casa, valor cem reais, odd dois vírgula dez. Aposta 2, conta Betano Alex, seleção fora, valor 100 reais, odd 2,10.',accounts);
 assert.equal(result.event,'Flamengo x Corinthians');assert.equal(result.market,'Resultado final');assert.equal(result.bets.length,2);assert.deepEqual(result.warnings,[]);
 assert.deepEqual(result.bets.map(b=>[b.account,b.stake,b.odd,b.selection]),[['a',10000,2.1,'Casa'],['b',10000,2.1,'Fora']]);
 const six=parse('Evento A contra B. Mercado total de gols primeiro tempo. '+Array.from({length:6},(_,i)=>`Aposta ${i+1}, conta Bet365 Manel, seleção mais de um vírgula cinco gols, valor cinquenta reais, odd três vírgula vinte.`).join(' '),accounts);
 assert.equal(six.bets.length,6);assert.equal(six.market,'Total de gols — 1º tempo');assert.equal(six.bets[5].selection,'Mais de 1,5 gols');assert.equal(six.bets[5].stake,5000);assert.equal(six.bets[5].odd,3.2);
 const free=parse('Jogo A versus B. Mercado ambas marcam. Primeira aposta conta Bet365 Manel seleção sim capital freebet valor cem reais odd quatro vírgula oito perda anterior quarenta reais. Segunda aposta conta Betano Alex seleção não valor duzentos e vinte e três reais e sessenta centavos odd um vírgula sete.',accounts);
 assert.equal(free.bets[0].capital,'Freebet');assert.equal(free.bets[0].previousLoss,4000);assert.equal(free.bets[0].stake,10000);assert.equal(free.bets[0].odd,4.8);assert.equal(free.bets[1].stake,22360);assert.ok(free.warnings.some(w=>w.includes('freebet recebida')));
 const ambiguous=parse('Evento A contra B. Mercado resultado final. Aposta 1 conta Bet365 seleção casa valor cem reais odd dois.',accounts);
 assert.equal(ambiguous.bets[0].account,'');assert.ok(ambiguous.warnings.some(w=>w.includes('selecione a conta')));
 const missing=parse('Evento A contra B. Mercado resultado final. Aposta 1 conta Bet365 Manel seleção casa.',accounts);
 assert.equal(missing.bets[0].stake,0);assert.equal(missing.bets[0].odd,0);assert.ok(missing.warnings.length>=3);
 const unknown=parse('Evento A contra B. Mercado resultado final. Aposta 1 conta Casa Inexistente João seleção casa valor 100 reais odd 2.',accounts);
 assert.equal(unknown.bets[0].account,'');
 const malformed=parse('eu quero fazer uma operação',accounts);assert.equal(malformed.bets.length,0);assert.ok(malformed.warnings.length>0);
 const spokenHouse=parse('Evento A contra B. Mercado resultado final. Aposta um conta bet três seis cinco Manel seleção casa valor cem reais odd dois.',accounts);assert.equal(spokenHouse.bets[0].account,'a');
 const thousands=parse('Evento A contra B. Mercado resultado final. Aposta 1 conta 365 Manel seleção casa valor 1.000 reais odd 2.10. Aposta 2 conta Betano Alex seleção fora valor 1.000 odd 2,10.',accounts);assert.equal(thousands.bets[0].stake,100000);assert.equal(thousands.bets[1].stake,100000);assert.equal(thousands.bets[0].odd,2.1);assert.equal(thousands.bets[0].account,'a');
 console.log('Voz: números, seis apostas, conta/titular, mercados, freebet, perda anterior e comandos incompletos verificados.');
} finally {fs.rmSync(temporary,{recursive:true,force:true});}
