import {env} from 'cloudflare:workers';
import {database} from '@/lib/store';
import type {RecordItem} from '@/lib/banca';
import {sendMessage,editMessageText,answerCallbackQuery,downloadFile,confirmKeyboard,esc} from '@/lib/telegram';
import {transcribeAudio,chatJson} from '@/lib/workers-ai';
import {botCommandSchema,buildSystemPrompt,extractJson,type BotCommand} from '@/lib/bot-commands';
import {resolveCommand,executeCommand,type Resolved} from '@/lib/bot-execute';

// Only this Telegram user can operate the bot. Hardcoded (like the export
// route's SECRET before it) rather than a Worker var, since the build
// pipeline here has no source-controlled place to declare plain vars —
// they'd be wiped by the next `npm run build` regenerating wrangler.json.
const ALLOWED_USER_ID=6040979260;

type Env={
 TELEGRAM_BOT_TOKEN?:string;
 TELEGRAM_WEBHOOK_SECRET?:string;
 CF_ACCOUNT_ID?:string;
 CF_AI_TOKEN?:string;
};
function getEnv():Env{return env as unknown as Env;}

async function allRows():Promise<RecordItem[]>{
 const r=await database().prepare('SELECT * FROM records').all();
 return r.results.map((row:any)=>({...row,data:JSON.parse(row.data)}));
}

// bot_pending holds one row per confirmation awaiting a tap, created right
// after parsing and deleted the moment it's used (confirmed or cancelled) or
// swept up once stale. It's a separate table from `records` on purpose: it's
// operational state for the bot, not part of the financial ledger, and must
// never show up in GET /api/records or in any summary().
async function savePending(id:string,chatId:number,cmd:BotCommand,resolved:Resolved):Promise<void>{
 const db=database();
 await db.prepare('DELETE FROM bot_pending WHERE created_at<?').bind(Date.now()-2*60*60*1000).run();
 await db.prepare('INSERT INTO bot_pending (id,chat_id,payload,created_at) VALUES (?,?,?,?)')
  .bind(id,chatId,JSON.stringify({cmd,resolved}),Date.now()).run();
}
async function takePending(id:string):Promise<{cmd:BotCommand;resolved:Resolved}|null>{
 const db=database();
 const row=await db.prepare('SELECT payload FROM bot_pending WHERE id=?').bind(id).first<{payload:string}>();
 if(!row)return null;
 await db.prepare('DELETE FROM bot_pending WHERE id=?').bind(id).run();
 return JSON.parse(row.payload);
}

async function handleMessage(e:Env,message:any):Promise<void>{
 const chatId=message.chat?.id;
 const userId=message.from?.id;
 if(!chatId)return;
 if(userId!==ALLOWED_USER_ID){
  await sendMessage(e,chatId,'🚫 Acesso não autorizado.');
  return;
 }
 if(typeof message.text==='string'&&message.text.startsWith('/start')){
  await sendMessage(e,chatId,'👋 Envie um áudio (ou digite) descrevendo o que quer registrar na Planilha Manel — contas, movimentações, arbitragens, alavancagem, ODD5, bancos ou comissões. Antes de salvar qualquer coisa, eu mostro o que entendi e peço confirmação.');
  return;
 }
 let text:string|null=null;
 const voice=message.voice||message.audio;
 if(voice){
  const bytes=await downloadFile(e,voice.file_id);
  if(!bytes){await sendMessage(e,chatId,'❌ Não consegui baixar o áudio do Telegram.');return;}
  try{
   text=await transcribeAudio(e,bytes);
  }catch(err){
   console.error('transcribe error',err);
   await sendMessage(e,chatId,'❌ Não consegui transcrever o áudio. Tente de novo ou digite o comando.');
   return;
  }
  if(!text){await sendMessage(e,chatId,'❌ Não entendi nada no áudio. Tente falar mais perto do microfone.');return;}
 }else if(typeof message.text==='string'&&message.text.trim()){
  text=message.text.trim();
 }
 if(!text){
  await sendMessage(e,chatId,'Envie um áudio ou digite o comando que você quer executar.');
  return;
 }

 const rows=await allRows();
 let raw:string;
 try{
  raw=await chatJson(e,buildSystemPrompt(rows),text);
 }catch(err){
  console.error('chatJson error',err);
  await sendMessage(e,chatId,'❌ A IA de interpretação de comandos não respondeu. Tente de novo em instantes.');
  return;
 }
 const json=extractJson(raw);
 const parsed=json?botCommandSchema.safeParse(json):null;
 if(!parsed||!parsed.success){
  console.error('bot parse failure',raw);
  await sendMessage(e,chatId,`🎤 Entendi: "${esc(text)}"\n\n❌ Não consegui transformar isso num comando válido. Pode repetir dizendo claramente a ação, a conta/casa e o valor em reais?`);
  return;
 }
 const cmd=parsed.data;
 if(cmd.acao==='nao_entendi'){
  await sendMessage(e,chatId,`🎤 Entendi: "${esc(text)}"\n\n❌ ${esc(cmd.motivo||'Não entendi o que você quer fazer. Pode repetir de outro jeito?')}`);
  return;
 }
 const resolved=resolveCommand(cmd,rows);
 if(!resolved.ok){
  await sendMessage(e,chatId,`🎤 Entendi: "${esc(text)}"\n\n❌ ${esc(resolved.error)}`);
  return;
 }
 const pendingId=crypto.randomUUID();
 await savePending(pendingId,chatId,cmd,resolved.resolved);
 await sendMessage(e,chatId,`🎤 Entendi: "${esc(text)}"\n\n📝 ${esc(resolved.description)}\n\nConfirma?`,confirmKeyboard(pendingId));
}

async function handleCallback(e:Env,cbq:any,origin:string):Promise<void>{
 await answerCallbackQuery(e,cbq.id);
 const userId=cbq.from?.id;
 const chatId=cbq.message?.chat?.id;
 const messageId=cbq.message?.message_id;
 const data:string=cbq.data||'';
 if(!chatId||!messageId)return;
 if(userId!==ALLOWED_USER_ID)return;
 const sep=data.indexOf(':');
 const prefix=sep===-1?data:data.slice(0,sep);
 const pendingId=sep===-1?'':data.slice(sep+1);
 if(prefix!=='cfm'&&prefix!=='cnl')return;
 const pending=await takePending(pendingId);
 if(!pending){
  await editMessageText(e,chatId,messageId,'⏱️ Essa confirmação expirou ou já foi usada. Envie o comando de novo.');
  return;
 }
 if(prefix==='cnl'){
  await editMessageText(e,chatId,messageId,'❌ Cancelado.');
  return;
 }
 const rows=await allRows();
 const result=await executeCommand(pending.cmd,pending.resolved,rows,origin);
 await editMessageText(e,chatId,messageId,result.text);
}

export async function POST(req:Request):Promise<Response>{
 try{
  const e=getEnv();
  const secretHeader=req.headers.get('x-telegram-bot-api-secret-token');
  if(e.TELEGRAM_WEBHOOK_SECRET&&secretHeader!==e.TELEGRAM_WEBHOOK_SECRET)return new Response('forbidden',{status:403});
  const update=await req.json().catch(()=>null) as any;
  if(!update)return Response.json({ok:true});
  const origin=new URL(req.url).origin;
  if(update.callback_query)await handleCallback(e,update.callback_query,origin);
  else if(update.message)await handleMessage(e,update.message);
  return Response.json({ok:true});
 }catch(err){
  // Always 200 back to Telegram — a non-2xx makes it retry-storm the same update.
  console.error('telegram webhook error',err);
  return Response.json({ok:true});
 }
}
