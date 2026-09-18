import {env} from 'cloudflare:workers';
import {getRequestExecutionContext} from 'vinext/shims/request-context';
type BackupEvent={kind:string;action:string;id?:string;revision?:number;summary?:string;data?:unknown;columns?:[string,string|number][]};

async function sendBackup(event:BackupEvent):Promise<void>{
 const e=env as unknown as {BACKUP_WEBHOOK_URL?:string;BACKUP_WEBHOOK_TOKEN?:string};
 const url=e.BACKUP_WEBHOOK_URL,token=e.BACKUP_WEBHOOK_TOKEN;
 if(!url||!token)return;
 try{
  // Google Apps Script Web Apps can take 30-60s to respond on a cold start,
  // so this is generous — it's scheduled in the background (see below) and
  // never blocks the user's request either way.
  await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,timestamp:Date.now(),...event}),signal:AbortSignal.timeout(60000)});
 }catch{
  // backup is best-effort only; ignore network/timeout errors
 }
}

/**
 * Best-effort mirror of a record change into an external Google Sheet (a Google Apps
 * Script Web App configured via the BACKUP_WEBHOOK_URL/BACKUP_WEBHOOK_TOKEN Worker
 * secrets). Silently does nothing if the webhook isn't configured.
 *
 * The real save has already committed to D1 by the time this runs, so a backup
 * failure or slow response must never delay or break the response the user is
 * waiting on. Apps Script cold starts can take up to ~60s, which would otherwise
 * stall every save — so this is scheduled via the Workers `waitUntil` API (exposed
 * through vinext's ExecutionContext accessor) to keep running after the response is
 * sent, instead of being awaited inline. Falls back to awaiting directly when no
 * ExecutionContext is available (e.g. local dev).
 */
export async function backupLog(event:BackupEvent):Promise<void>{
 const ctx=getRequestExecutionContext();
 const task=sendBackup(event);
 if(ctx){ctx.waitUntil(task);return;}
 await task;
}
