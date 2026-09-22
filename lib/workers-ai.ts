// Thin client for Cloudflare Workers AI's REST API (not the Worker binding —
// this project's build pipeline (.openai/hosting.json) only wires up D1/R2
// bindings, so a `wrangler d1`-style "ai" binding can't be declared here.
// The REST API needs only an account id + API token, both stored as Worker
// secrets, and works identically from any fetch() call).
export type WorkersAiEnv={CF_ACCOUNT_ID?:string;CF_AI_TOKEN?:string};

async function run(env:WorkersAiEnv,model:string,input:unknown):Promise<any>{
 if(!env.CF_ACCOUNT_ID||!env.CF_AI_TOKEN)throw new Error('IA não configurada (faltam CF_ACCOUNT_ID/CF_AI_TOKEN)');
 const url=`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/ai/run/${model}`;
 const res=await fetch(url,{method:'POST',headers:{authorization:`Bearer ${env.CF_AI_TOKEN}`,'content-type':'application/json'},body:JSON.stringify(input)});
 const json:any=await res.json().catch(()=>null);
 if(!json?.success)throw new Error('Falha na IA ('+model+'): '+(json?.errors?.[0]?.message||res.status));
 return json.result;
}

/** Transcribes an audio clip (any format Telegram sends — ogg/opus voice notes, mp3/m4a audio) to text.
 * Whisper's REST input schema wants the audio as a raw binary body, not wrapped in JSON like the other
 * models here (a JSON array of byte values is rejected: "Type mismatch of '/audio', 'string' not in
 * 'array','binary'") — so this bypasses run() and posts the bytes directly. */
export async function transcribeAudio(env:WorkersAiEnv,bytes:ArrayBuffer):Promise<string>{
 if(!env.CF_ACCOUNT_ID||!env.CF_AI_TOKEN)throw new Error('IA não configurada (faltam CF_ACCOUNT_ID/CF_AI_TOKEN)');
 const url=`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/ai/run/@cf/openai/whisper-large-v3-turbo`;
 const res=await fetch(url,{method:'POST',headers:{authorization:`Bearer ${env.CF_AI_TOKEN}`,'content-type':'application/octet-stream'},body:bytes});
 const json:any=await res.json().catch(()=>null);
 if(!json?.success)throw new Error('Falha na IA (whisper): '+(json?.errors?.[0]?.message||res.status));
 return String(json.result?.text||'').trim();
}

/** Asks an instruct model to turn free-form Portuguese text into the JSON command described by systemPrompt. Returns the raw model output — the caller is responsible for tolerant JSON extraction, since not every model/version reliably obeys response_format. */
export async function chatJson(env:WorkersAiEnv,systemPrompt:string,userText:string):Promise<string>{
 const result=await run(env,'@cf/meta/llama-3.3-70b-instruct-fp8-fast',{
  messages:[{role:'system',content:systemPrompt},{role:'user',content:userText}],
  temperature:0.1,
  max_tokens:1024,
  response_format:{type:'json_object'},
 });
 return String(result?.response||'').trim();
}
