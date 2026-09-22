"use client";
import {useRef,useState} from 'react';
import {ArrowDownToLine,ArrowUpFromLine,ArrowLeftRight} from 'lucide-react';
import {toast} from 'sonner';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {money} from '@/lib/banca';
import type {BankAccount} from '@/lib/banks';
import {apiFetch} from '@/lib/api-client';
type Action='deposit'|'withdraw'|'transfer';
const labels={deposit:'Depositar',withdraw:'Sacar',transfer:'Transferir entre bancos'};
export function BankActions({bank,banks,disabled,onUpdated}:{bank:BankAccount;banks:BankAccount[];disabled:boolean;onUpdated:()=>void}){
 const [action,setAction]=useState<Action|null>(null);
 const [snapshot,setSnapshot]=useState<BankAccount[]>([]);
 const [amount,setAmount]=useState('');
 const [destination,setDestination]=useState('');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const sending=useRef(false);
 const source=snapshot.find(b=>b.id===bank.id);
 const target=snapshot.find(b=>b.id===destination);
 const amountText=amount.trim().replace(',','.');
 const cents=/^\d+(\.\d{1,2})?$/.test(amountText)?Math.round(Number(amountText)*100):0;
 const valid=Number.isSafeInteger(cents)&&cents>0&&cents<=10000000000&&source&&(action==='deposit'||cents<=source.balance)&&(action!=='transfer'||!!target);
 function open(type:Action){setSnapshot(structuredClone(banks));setAction(type);setAmount('');setDestination('');setError('');}
 async function save(e:React.FormEvent){
  e.preventDefault();if(sending.current||!valid||!source||!action)return;
  sending.current=true;setBusy(true);setError('');
  try{
   const r=await apiFetch('/api/bank-transactions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:action,source:source.id,sourceRevision:source.revision,destination:target?.id,destinationRevision:target?.revision,amount:cents})});
   const data=await r.json();if(!r.ok)throw new Error(data.error||'Não foi possível salvar.');
   setAction(null);toast.success('Operação bancária registrada');onUpdated();
  }catch(e){setError(e instanceof Error?e.message:'Falha de conexão. Feche e sincronize para conferir o saldo antes de repetir.');}
  finally{sending.current=false;setBusy(false);}
 }
 return <>
  <div className="account-actions" style={{display:'flex',flexWrap:'wrap',gap:8,marginTop:20}}>
   <button type="button" disabled={disabled||busy} onClick={()=>open('deposit')}><ArrowDownToLine size={17}/>Depositar</button>
   <button type="button" disabled={disabled||busy} onClick={()=>open('withdraw')}><ArrowUpFromLine size={17}/>Sacar</button>
   <button type="button" disabled={disabled||busy} onClick={()=>open('transfer')}><ArrowLeftRight size={17}/>Transferir entre bancos</button>
  </div>
  <Dialog open={!!action} onOpenChange={value=>{if(!value&&!sending.current)setAction(null);}}>
   <DialogContent className="editor"><DialogHeader><DialogTitle>{action?labels[action]:''}</DialogTitle><DialogDescription>Registre a operação na planilha. Saldo de {source?.bank} · {source?.holder}: {money(source?.balance||0)}.</DialogDescription></DialogHeader>
    <form onSubmit={save}>
     <div className="form-grid">
      {action==='transfer'&&<label className="field">Banco de destino<select required disabled={busy} value={destination} onChange={e=>setDestination(e.target.value)}><option value="">Selecione o banco e a pessoa</option>{snapshot.filter(b=>b.id!==bank.id).map(b=><option key={b.id} value={b.id}>{b.bank} · {b.holder}</option>)}</select></label>}
      <label className="field">Valor (R$)<input autoFocus required inputMode="decimal" disabled={busy} placeholder="0,00" value={amount} onChange={e=>setAmount(e.target.value)}/></label>
     </div>
     {action==='transfer'&&snapshot.length<2&&<p role="status">Cadastre outro banco para fazer uma transferência.</p>}
     {cents>0&&source&&<p>Saldo após a operação: <strong>{money(source.balance+(action==='deposit'?cents:-cents))}</strong>{action==='transfer'&&target&&<>. Destino: <strong>{money(target.balance+cents)}</strong></>}</p>}
     {action!=='deposit'&&source&&cents>source.balance&&<p role="alert">Saldo insuficiente.</p>}
     {error&&<p className="error" role="alert">{error}</p>}
     <div style={{display:'flex',justifyContent:'flex-end',gap:12,marginTop:20}}><button type="button" disabled={busy} onClick={()=>setAction(null)}>Cancelar</button><button className="primary" type="submit" disabled={busy||!valid}>{busy?'Salvando…':'Confirmar'}</button></div>
    </form>
   </DialogContent>
  </Dialog>
 </>;
}
