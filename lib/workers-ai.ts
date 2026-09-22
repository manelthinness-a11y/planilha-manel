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

function arrayBufferToBase64(buf:ArrayBuffer):string{
 const bytes=new Uint8Array(buf);
 let binary='';
 const chunkSize=0x8000; // avoid blowing the call stack on String.fromCharCode(...bigArray)
 for(let i=0;i<bytes.length;i+=chunkSize)binary+=String.fromCharCode(...bytes.subarray(i,i+chunkSize));
 return btoa(binary);
}

/** Transcribes an audio clip (any format Telegram sends — ogg/opus voice notes, mp3/m4a audio) to text.
 * Whisper's REST input schema (schema-input.json) only accepts `audio` as a base64 string or a
 * {body,contentType} object — raw binary/array-of-bytes in the request body is rejected as "Invalid
 * input", so the bytes are base64-encoded and sent through run() like the other models. */
export async function transcribeAudio(env:WorkersAiEnv,bytes:ArrayBuffer):Promise<string>{
 const result=await run(env,'@cf/openai/whisper-large-v3-turbo',{audio:arrayBufferToBase64(bytes)});
 return String(result?.text||'').trim();
}

/** Asks an instruct model to turn free-form Portuguese text into the JSON command described by systemPrompt. Returns the raw model output — the caller is responsible for tolerant JSON extraction, since not every model/version reliably obeys response_format. */
export async function chatJson(env:WorkersAiEnv,systemPrompt:string,userText:string):Promise<string>{
 const result=await run(env,'@cf/meta/llama-3.3-70b-instruct-fp8-fast',{
  messages:[{role:'system',content:systemPrompt},{role:'user',content:userText}],
  temperature:0.1,
  max_tokens:1024,
  response_format:{type:'json_object'},
 });
 const response=result?.response;
 // With response_format:json_object this model sometimes hands back `response` already parsed
 // into an object instead of a JSON string — String(anObject) silently degrades to the useless
 // "[object Object]" (no '{' in it, so extractJson's brace-scan finds nothing and every command
 // was reported as an unparseable "bot parse failure"). Re-serialize it so the caller always gets
 // real JSON text either way.
 if(response&&typeof response==='object')return JSON.stringify(response);
 return String(response||'').trim();
}
