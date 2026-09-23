import {z} from 'zod';
import type {RecordItem} from './banca';
import {leverageEntries,TRACKS,type Group} from './alavancagem';
import {odd5Entries} from './odd5';

// ---------- helpers ----------

export const toCents=(reais:number)=>Math.round(reais*100);
export const brl=(cents:number)=>(cents/100).toFixed(2).replace('.',',');
export const todayISO=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());

// Strips accents AND punctuation (commas, periods, parens — the LLM's "conta" field sometimes
// keeps a stray comma from how the user phrased it, e.g. "Stake, Manel") down to plain words.
const norm=(v:string)=>v.normalize('NFKD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');

// Two words "match" if they're identical, or — only once both are long enough (3+ chars) — one
// contains the other. Without the length guard, single-letter words like the "a" in "viva a sorte"
// trivially match almost any query word that happens to contain an "a", producing bogus hits.
function wordMatch(w:string,cw:string):boolean{
 return w===cw||(w.length>=3&&cw.length>=3&&(cw.includes(w)||w.includes(cw)));
}

function matchScore(query:string,candidate:string):number{
 const q=norm(query),c=norm(candidate);
 if(!q||!c)return 0;
 if(c===q)return 100;
 if(c.includes(q)||q.includes(c))return 80;
 const qWords=q.split(' '),cWords=c.split(' ');
 const hits=qWords.filter(w=>cWords.some(cw=>wordMatch(w,cw))).length;
 return hits/Math.max(qWords.length,1)*60;
}

/** Best-scoring item, or null if nothing clears the threshold OR if two+ items tie for the top
 * score. The tie case matters a lot here: this user's accounts mostly share the same titular
 * ("Manel"), so a query that's just a person's name (no house name) scores 100/80 identically
 * against dozens of accounts — picking "whichever came first" in that case is silently guessing
 * the wrong account instead of admitting the query wasn't specific enough. */
function bestMatch<T>(query:string,items:T[],labels:(item:T)=>string[]):T|null{
 let best:{item:T;s:number}|null=null;
 let tied=false;
 for(const item of items){
  const s=Math.max(...labels(item).map(l=>matchScore(query,l)));
  if(!best||s>best.s){best={item,s};tied=false;}
  else if(s===best.s&&s>=35)tied=true;
 }
 if(!best||best.s<35||tied)return null;
 return best.item;
}

// Match against the combined "casa · titular" string ONLY — not house-alone or holder-alone as
// separate candidate labels. This user has ~70 accounts and the same few titulars repeat across
// most of them ("Manel" alone on ~60), so a standalone holder-only label let a query with no house
// name score a perfect/near-perfect match against every one of that person's accounts, and
// bestMatch's tie-break (first in list) would then silently pick the wrong one. Matching only the
// combined string forces a real house name to be present for a confident match, and still lets a
// bare house name ("Pagolbet") resolve fine on its own since query and candidate overlap directly.
export function resolveAccount(rows:RecordItem[],query:string){
 return bestMatch(query,rows.filter(r=>r.kind==='account'),r=>[r.data.house+' '+r.data.holder]);
}
export function resolveBank(rows:RecordItem[],query:string){
 return bestMatch(query,rows.filter(r=>r.kind==='bank'),r=>[r.data.bank+' '+r.data.holder]);
}
export function resolvePerson(rows:RecordItem[],query:string){
 return bestMatch(query,rows.filter(r=>r.kind==='commission_person'),r=>[r.data.name]);
}
export function resolvePendingArb(rows:RecordItem[],query:string){
 const pending=rows.filter(r=>r.kind==='arb'&&r.data.bets.some((b:any)=>b.status==='Pendente'));
 return bestMatch(query,pending,r=>[r.data.event]);
}
export function resolveArbByEvent(rows:RecordItem[],query:string){
 return bestMatch(query,rows.filter(r=>r.kind==='arb'),r=>[r.data.event]);
}
export function resolveOdd5(rows:RecordItem[],query:string,onlyPending:boolean){
 const items=rows.filter(r=>r.kind==='odd5'&&(!onlyPending||r.data.result==='Pendente'));
 return bestMatch(query,items,r=>[r.data.event]);
}
export function resolveCamilo(rows:RecordItem[],query:string,onlyPending:boolean){
 const items=rows.filter(r=>r.kind==='camilo'&&(!onlyPending||r.data.result==='Pendente'));
 return bestMatch(query,items,r=>[r.data.event]);
}

export const leverageGroupOf=(grupo:'1,3'|'2,0'):Group=>grupo==='1,3'?'alavancagem':'alavancagem2';
export const leverageGroupLabel=(g:Group)=>TRACKS.find(t=>t.mainGroup===g)?.label||g;

// ---------- command schema ----------

const reais=z.number().min(0).max(100000000);
const dateStr=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional();
const txt=(max=200)=>z.string().trim().min(1).max(max);

export const botCommandSchema=z.discriminatedUnion('acao',[
 z.object({acao:z.literal('criar_conta'),casa:txt(120),titular:txt(120),saldoInicial:reais.default(0),observacao:z.string().max(500).optional()}),
 z.object({acao:z.literal('criar_movimentacao'),conta:txt(),tipo:z.enum(['deposito','saque','ajuste_positivo','ajuste_negativo']),valor:reais,data:dateStr,observacao:z.string().max(500).optional()}),
 z.object({acao:z.literal('criar_banco'),banco:txt(120),titular:txt(120),saldo:reais.default(0),observacao:z.string().max(500).optional()}),
 z.object({acao:z.literal('transacao_bancaria'),tipo:z.enum(['deposito','saque','transferencia']),bancoOrigem:txt(),bancoDestino:z.string().max(200).optional(),valor:reais}),
 z.object({acao:z.literal('criar_pessoa_comissao'),nome:txt(120),observacao:z.string().max(500).optional()}),
 z.object({acao:z.literal('criar_comissao'),pessoa:txt(),tipo:z.enum(['comissao','debito','pagamento']),valor:reais,data:dateStr,observacao:z.string().max(500).optional()}),
 z.object({acao:z.literal('criar_arbitragem'),evento:txt(),mercado:txt(120),data:dateStr,observacao:z.string().max(500).optional(),apostas:z.array(z.object({
  conta:txt(),valor:reais,odd:z.number().min(1).max(1000),status:z.enum(['pendente','ganhou','perdeu','cancelada','cashout']).default('pendente'),retorno:reais.optional(),
 })).min(2).max(10)}),
 z.object({acao:z.literal('liquidar_aposta_arbitragem'),evento:txt(),conta:txt(),status:z.enum(['ganhou','perdeu','cancelada','cashout']),retorno:reais.optional()}),
 z.object({acao:z.literal('excluir_conta'),conta:txt()}),
 z.object({acao:z.literal('excluir_pessoa_comissao'),pessoa:txt()}),
 z.object({acao:z.literal('excluir_arbitragem'),evento:txt()}),
 z.object({acao:z.literal('alavancagem_criar'),grupo:z.enum(['1,3','2,0']),conta:txt(),evento:txt(),mercado:txt(120),odd:z.number().min(1).max(10),data:dateStr}),
 z.object({acao:z.literal('alavancagem_liquidar'),grupo:z.enum(['1,3','2,0']),resultado:z.enum(['green','red'])}),
 z.object({acao:z.literal('alavancagem_excluir'),grupo:z.enum(['1,3','2,0'])}),
 z.object({acao:z.literal('odd5_criar'),evento:txt(),mercados:z.array(txt(120)).min(1).max(10),odd:z.number().min(1).max(1000),valor:reais,conta:txt()}),
 z.object({acao:z.literal('odd5_liquidar'),evento:txt(),resultado:z.enum(['green','red'])}),
 z.object({acao:z.literal('odd5_excluir'),evento:txt()}),
 z.object({acao:z.literal('camilo_criar'),evento:txt(),mercados:z.array(txt(120)).min(1).max(10),odd:z.number().min(1).max(1000),valor:reais,conta:txt(),data:dateStr}),
 z.object({acao:z.literal('camilo_liquidar'),evento:txt(),resultado:z.enum(['green','red'])}),
 z.object({acao:z.literal('camilo_excluir'),evento:txt()}),
 z.object({acao:z.literal('nao_entendi'),motivo:z.string().max(300).optional()}),
]);
export type BotCommand=z.infer<typeof botCommandSchema>;

/** Extracts and parses the first {...} JSON object found in raw model output — tolerant of stray prose/markdown fences some models add despite instructions. */
export function extractJson(raw:string):unknown|null{
 const cleaned=raw.replace(/```json|```/g,'').trim();
 const start=cleaned.indexOf('{');
 const end=cleaned.lastIndexOf('}');
 if(start===-1||end===-1||end<start)return null;
 try{return JSON.parse(cleaned.slice(start,end+1));}catch{return null;}
}

// ---------- prompt ----------

export function buildSystemPrompt(rows:RecordItem[]):string{
 const accounts=rows.filter(r=>r.kind==='account').map(r=>`- ${r.data.house} · ${r.data.holder}`).join('\n')||'(nenhuma)';
 const banks=rows.filter(r=>r.kind==='bank').map(r=>`- ${r.data.bank} · ${r.data.holder}`).join('\n')||'(nenhum)';
 const people=rows.filter(r=>r.kind==='commission_person').map(r=>`- ${r.data.name}`).join('\n')||'(nenhuma)';
 const pendingArbs=rows.filter(r=>r.kind==='arb'&&r.data.bets.some((b:any)=>b.status==='Pendente')).map(r=>`- ${r.data.event}`).join('\n')||'(nenhuma)';
 return `Você converte comandos em português (falados ou digitados) sobre o app "Planilha Manel", um controle de banca de apostas/arbitragem esportiva, em UM objeto JSON de comando. Responda APENAS com o JSON, sem nenhum texto antes ou depois, sem markdown.

Data de hoje: ${todayISO()} (use este valor no campo "data" quando o usuário não disser uma data).

Contas cadastradas (formato "casa · titular"; use os nomes de casa/titular para preencher o campo "conta" o mais parecido possível com o que está cadastrado). ATENÇÃO: a grande maioria das contas tem o titular "Manel" — o nome do app também é "Planilha Manel", mas isso é só o nome do app, não elimina o titular real de cada conta. Como o titular se repete tanto, é o nome da CASA (a banca/site de apostas, ex: "Bolsa de apostas", "Pagolbet", "Stake") que de fato diferencia uma conta da outra. Por isso, sempre que o usuário citar um nome de casa/banca, esse nome tem que aparecer no campo "conta" — nunca preencha "conta" só com o titular ("Manel"), mesmo que o titular seja a última coisa que a pessoa falou:
${accounts}

Bancos cadastrados (formato "banco · titular"):
${banks}

Pessoas de comissão cadastradas:
${people}

Arbitragens com apostas pendentes (para liquidar/excluir por evento):
${pendingArbs}

Escolha exatamente UMA "acao" dentre estas e preencha os campos daquele formato (valores monetários sempre em reais, decimal, ex: 150.50; nunca em centavos):

{"acao":"criar_conta","casa":string,"titular":string,"saldoInicial":number,"observacao":string?}
{"acao":"criar_movimentacao","conta":string,"tipo":"deposito"|"saque"|"ajuste_positivo"|"ajuste_negativo","valor":number,"data":string?,"observacao":string?}
{"acao":"criar_banco","banco":string,"titular":string,"saldo":number,"observacao":string?}
{"acao":"transacao_bancaria","tipo":"deposito"|"saque"|"transferencia","bancoOrigem":string,"bancoDestino":string?,"valor":number}
{"acao":"criar_pessoa_comissao","nome":string,"observacao":string?}
{"acao":"criar_comissao","pessoa":string,"tipo":"comissao"|"debito"|"pagamento","valor":number,"data":string?,"observacao":string?}
{"acao":"criar_arbitragem","evento":string,"mercado":string,"data":string?,"observacao":string?,"apostas":[{"conta":string,"valor":number,"odd":number,"status":"pendente"|"ganhou"|"perdeu"|"cancelada"|"cashout","retorno":number?}]}  (mínimo 2 apostas, uma por casa; "retorno" só quando status for ganhou ou cashout — é quanto a casa devolveu no total, não o lucro)
{"acao":"liquidar_aposta_arbitragem","evento":string,"conta":string,"status":"ganhou"|"perdeu"|"cancelada"|"cashout","retorno":number?}  (usado quando uma arbitragem já cadastrada estava pendente numa casa e agora saiu o resultado dessa casa)
{"acao":"excluir_conta","conta":string}
{"acao":"excluir_pessoa_comissao","pessoa":string}
{"acao":"excluir_arbitragem","evento":string}
{"acao":"alavancagem_criar","grupo":"1,3"|"2,0","conta":string,"evento":string,"mercado":string,"odd":number,"data":string?}  (grupo "1,3" = odds entre 1.30 e 1.60; grupo "2,0" = odds entre 2.00 e 2.30)
{"acao":"alavancagem_liquidar","grupo":"1,3"|"2,0","resultado":"green"|"red"}  (liquida a entrada pendente daquele grupo)
{"acao":"alavancagem_excluir","grupo":"1,3"|"2,0"}  (exclui a entrada pendente daquele grupo)
{"acao":"odd5_criar","evento":string,"mercados":[string],"odd":number,"valor":number,"conta":string}
{"acao":"odd5_liquidar","evento":string,"resultado":"green"|"red"}
{"acao":"odd5_excluir","evento":string}
{"acao":"camilo_criar","evento":string,"mercados":[string],"odd":number,"valor":number,"conta":string,"data":string?}  (aba "Camilo", dentro do grupo Alavancagem no menu — é uma aba própria, diferente da "alavancagem_criar")
{"acao":"camilo_liquidar","evento":string,"resultado":"green"|"red"}
{"acao":"camilo_excluir","evento":string}
{"acao":"nao_entendi","motivo":string?}  (use quando o comando não corresponder a nenhuma ação acima, ou faltar alguma informação essencial)

Regras importantes:
- Nunca invente contas, bancos ou pessoas que não estejam nas listas acima — apenas repita o nome mais parecido possível do que a pessoa falou, mesmo que a grafia não seja exata (a resolução final é feita por outro sistema).
- Exemplo: se a pessoa falar "Saque 50 reais, Manel, bolsa de apostas", o campo "conta" deve ser "bolsa de apostas" (ou "bolsa de apostas Manel") — NÃO "Manel" sozinho, porque "Manel" é titular de dezenas de contas diferentes e não identifica qual delas é a certa.
- Se o comando pedir para "registrar", "cadastrar", "lançar", "entrou", "criar" algo novo, use as ações de criação. Se pedir para "bateu", "não bateu", "ganhou", "perdeu", "finalizar", "liquidar" algo que já existe, use as ações de liquidação.
- Se o usuário mencionar "Camilo" explicitamente, use sempre uma das ações camilo_* — NUNCA alavancagem_criar/liquidar/excluir. "Camilo" é uma aba própria (grupo "1,3" e "2,0" são só da Alavancagem normal, não têm relação com Camilo).
- Nunca responda com texto fora do JSON. Nunca use markdown.`;
}

// ---------- human-readable descriptions ----------

export const tipoMovLabel:Record<string,string>={deposito:'Depósito',saque:'Saque',ajuste_positivo:'Ajuste positivo',ajuste_negativo:'Ajuste negativo'};
export const tipoComissaoLabel:Record<string,string>={comissao:'Comissão',debito:'Débito',pagamento:'Pagamento'};
export const statusApostaLabel:Record<string,string>={pendente:'Pendente',ganhou:'Ganhou',perdeu:'Perdeu',cancelada:'Cancelada',cashout:'Cashout'};
export const resultadoLabel:Record<string,string>={green:'Green',red:'Red'};
