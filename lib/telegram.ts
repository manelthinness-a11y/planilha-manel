// Thin client for the Telegram Bot API. Talks to api.telegram.org over plain
// fetch — no SDK dependency, keeps the bundle small and avoids needing any
// new Cloudflare bindings beyond the TELEGRAM_BOT_TOKEN secret.
export type TelegramEnv={TELEGRAM_BOT_TOKEN?:string};

function endpoint(env:TelegramEnv,method:string):string{
 if(!env.TELEGRAM_BOT_TOKEN)throw new Error('TELEGRAM_BOT_TOKEN não configurado');
 return `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`;
}

export async function tgCall(env:TelegramEnv,method:string,body:Record<string,unknown>):Promise<any>{
 const res=await fetch(endpoint(env,method),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
 const json:any=await res.json().catch(()=>null);
 if(!json?.ok)console.error('telegram api error',method,res.status,json);
 return json;
}

/** Escapes text for Telegram's HTML parse mode. Always run untrusted/user-sourced text through this before interpolating into a message. */
export function esc(v:string):string{
 return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

export const sendMessage=(env:TelegramEnv,chatId:number,text:string,replyMarkup?:unknown)=>
 tgCall(env,'sendMessage',{chat_id:chatId,text,reply_markup:replyMarkup,parse_mode:'HTML',disable_web_page_preview:true});

export const editMessageText=(env:TelegramEnv,chatId:number,messageId:number,text:string,replyMarkup?:unknown)=>
 tgCall(env,'editMessageText',{chat_id:chatId,message_id:messageId,text,reply_markup:replyMarkup,parse_mode:'HTML'});

export const answerCallbackQuery=(env:TelegramEnv,id:string,text?:string)=>
 tgCall(env,'answerCallbackQuery',{callback_query_id:id,text,show_alert:false});

export async function downloadFile(env:TelegramEnv,fileId:string):Promise<ArrayBuffer|null>{
 const info=await tgCall(env,'getFile',{file_id:fileId});
 if(!info?.ok)return null;
 const url=`https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${info.result.file_path}`;
 const res=await fetch(url);
 if(!res.ok)return null;
 return res.arrayBuffer();
}

export const confirmKeyboard=(pendingId:string)=>({inline_keyboard:[[
 {text:'✅ Confirmar',callback_data:'cfm:'+pendingId},
 {text:'❌ Cancelar',callback_data:'cnl:'+pendingId},
]]});
