import {env} from 'cloudflare:workers';
type BackupEvent={kind:string;action:string;id?:string;revision?:number;summary?:string;data?:unknown};
/**
 * Best-effort mirror of a record change into an external Google Sheet (see /BACKUP_SETUP.md).
 * Silently does nothing if the webhook isn't configured, and never throws — a backup failure
 * must never break the real save, which has already committed to D1 by the time this runs.
 */
export async function backupLog(event:BackupEvent):Promise<void>{
 const e=env as unknown as {BACKUP_WEBHOOK_URL?:string;BACKUP_WEBHOOK_TOKEN?:string};
 const url=e.BACKUP_WEBHOOK_URL,token=e.BACKUP_WEBHOOK_TOKEN;
 if(!url||!token)return;
 try{
  await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,timestamp:Date.now(),...event}),signal:AbortSignal.timeout(4000)});
 }catch{
  // backup is best-effort only; ignore network/timeout errors
 }
}
