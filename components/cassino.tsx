"use client";
import {useRef,useState} from 'react';
import {Plus,Minus,Trash2,Pencil,TrendingUp,TrendingDown,Wallet} from 'lucide-react';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Table,TableHeader,TableBody,TableHead,TableRow,TableCell} from '@/components/ui/table';
import {money,RecordItem,summary} from '@/lib/banca';
import {cassinoEntries,cassinoTotals,cassinoByAccount,type CassinoEntry} from '@/lib/cassino';
import {PersonAccountPicker} from '@/components/person-account-picker';
import {apiFetch} from '@/lib/api-client';
import {type PeriodFilter,inPeriod} from '@/lib/period-filter';
type PanelProps={rows:RecordItem[];disabled:boolean;onUpdated:()=>Promise<unknown>;period:PeriodFilter};
const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');};
const dateBR=(d:string)=>d?d.split('-').reverse().join('/'):'';
export function CassinoPanel({rows,disabled,onUpdated,period}:PanelProps){
 const accounts=summary(rows).accounts;
 const entries=cassinoEntries(rows);
 const visible=entries.filter(r=>inPeriod(r.data.date,period));
 const totals=cassinoTotals(visible as any);
 const byAccount=cassinoByAccount(visible as any);
 const [open,setOpen]=useState(false),[editing,setEditing]=useState<{id:string;revision:number}|null>(null);
 const [type,setType]=useState<'Ganho'|'Perda'>('Ganho'),[amountInput,setAmountInput]=useState(''),[accountId,setAccountId]=useState(''),[dateInput,setDateInput]=useState(today()),[note,setNote]=useState('');
 const [error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [deleteTarget,setDeleteTarget]=useState<{id:string;revision:number;label:string}|null>(null);
 const lock=useRef(false);
 async function send(body:unknown){if(lock.current)return;lock.current=true;setBusy(true);setError('');try{
  const response=await apiFetch('/api/cassino',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data:any=await response.json();if(!response.ok)throw new Error(data.error||'Não foi possível salvar.');
  setOpen(false);setDeleteTarget(null);setEditing(null);await onUpdated();
 }catch(e){setError(e instanceof Error?e.message:'Falha na conexão. Sincronize antes de tentar novamente.');}finally{lock.current=false;setBusy(false);}}
 function startCreate(kind:'Ganho'|'Perda'){setEditing(null);setType(kind);setAmountInput('');setAccountId('');setDateInput(today());setNote('');setError('');setOpen(true);}
 function startEdit(r:{id:string;revision:number;data:CassinoEntry}){setEditing({id:r.id,revision:r.revision});setType(r.data.type);setAmountInput((r.data.amount/100).toFixed(2));setAccountId(r.data.accountId||'');setDateInput(r.data.date||today());setNote(r.data.note||'');setError('');setOpen(true);}
 function submit(e:any){
  e.preventDefault();
  if(!accounts.find(a=>a.id===accountId)){setError('Selecione a pessoa e a casa.');return;}
  const cents=Math.round(Number(amountInput.replace(',','.'))*100);
  if(!Number.isFinite(cents)||cents<=0){setError('Informe um valor válido.');return;}
  if(!dateInput){setError('Informe a data.');return;}
  const payload={type,amount:cents,accountId,date:dateInput,note:note.trim()};
  if(editing)void send({action:'edit',id:editing.id,revision:editing.revision,...payload});
  else void send({action:'create',...payload});
 }
 const label=(d:CassinoEntry)=>d.house+' · '+d.account;
 return <div>
  <p className="hint" style={{margin:0}}>Registre cada ganho ou perda do cassino por pessoa e casa. Ganho soma no saldo real da conta escolhida; perda desconta dessa mesma conta.</p>
  <section className="stats" style={{margin:'16px 0'}}>
   <div className="stat"><span>Ganhos <TrendingUp size={19}/></span><strong className="positive">{money(totals.gains)}</strong><small>{totals.gainCount} {totals.gainCount===1?'registro':'registros'} no período</small></div>
   <div className="stat"><span>Perdas <TrendingDown size={19}/></span><strong className="negative">{money(totals.losses)}</strong><small>{totals.lossCount} {totals.lossCount===1?'registro':'registros'} no período</small></div>
   <div className="stat"><span>Saldo total <Wallet size={19}/></span><strong className={totals.balance<0?'negative':'positive'}>{money(totals.balance)}</strong><small>Ganhos − perdas do período</small></div>
  </section>
  <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
   <button type="button" className="primary" disabled={disabled||busy||!accounts.length} onClick={()=>startCreate('Ganho')}><Plus size={18}/>Registrar ganho</button>
   <button type="button" className="secondary" disabled={disabled||busy||!accounts.length} onClick={()=>startCreate('Perda')}><Minus size={18}/>Registrar perda</button>
  </div>
  {!accounts.length&&<p className="hint">Cadastre uma conta na aba Contas antes de registrar.</p>}
  {error&&!open&&!deleteTarget&&<p className="error" role="alert">{error}</p>}
  <div className="section-title"><h2>Por pessoa e casa <span>{byAccount.length}</span></h2></div>
  {byAccount.length?<div className="panel"><Table><TableHeader><TableRow>{['Pessoa · Casa','Ganhos','Perdas','Saldo','Registros'].map(h=><TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader><TableBody>{byAccount.map(a=><TableRow key={a.key}><TableCell><b>{a.account}</b><small>{a.house}</small></TableCell><TableCell className="positive">{money(a.gains)}</TableCell><TableCell className="negative">{money(a.losses)}</TableCell><TableCell><b className={a.balance<0?'negative':'positive'}>{money(a.balance)}</b></TableCell><TableCell>{a.count}</TableCell></TableRow>)}</TableBody></Table></div>:<div className="quiet-empty">{entries.length?'Nenhum registro de cassino no período selecionado.':'Nenhum registro de cassino ainda.'}</div>}
  <div className="section-title"><h2>Registros <span>{visible.length}</span></h2></div>
  {visible.length?<div className="panel"><Table><TableHeader><TableRow>{['Data','Pessoa · Casa','Tipo','Valor','Observação',''].map((h,i)=><TableHead key={i}>{h}</TableHead>)}</TableRow></TableHeader><TableBody>{[...visible].sort((a,b)=>(b.data.date||'').localeCompare(a.data.date||'')).map(r=><TableRow key={r.id}><TableCell>{dateBR(r.data.date)}</TableCell><TableCell><b>{r.data.account}</b><small>{r.data.house}</small></TableCell><TableCell><span className={'pill '+(r.data.type==='Ganho'?'done':'loss')}>{r.data.type}</span></TableCell><TableCell><b className={r.data.type==='Ganho'?'positive':'negative'}>{r.data.type==='Ganho'?'+':'−'} {money(r.data.amount)}</b></TableCell><TableCell>{r.data.note||'—'}</TableCell><TableCell><div style={{display:'flex',gap:12,justifyContent:'flex-end'}}><button type="button" className="text-button" style={{display:'inline-flex',alignItems:'center',gap:4}} disabled={disabled||busy} onClick={()=>startEdit(r)} aria-label={'Editar registro de '+label(r.data)}><Pencil size={14}/>Editar</button><button type="button" className="text-button negative" style={{display:'inline-flex',alignItems:'center',gap:4}} disabled={disabled||busy} onClick={()=>{setError('');setDeleteTarget({id:r.id,revision:r.revision,label:r.data.type+' de '+money(r.data.amount)+' · '+label(r.data)});}} aria-label={'Excluir registro de '+label(r.data)}><Trash2 size={14}/>Excluir</button></div></TableCell></TableRow>)}</TableBody></Table></div>:null}
  <Dialog open={open} onOpenChange={v=>{if(!busy)setOpen(v);}}><DialogContent className="editor"><DialogHeader><DialogTitle>{editing?'Editar registro':type==='Ganho'?'Registrar ganho':'Registrar perda'}</DialogTitle><DialogDescription>Informe o valor, a data e a conta (pessoa e casa). O saldo real dessa conta é atualizado na hora.</DialogDescription></DialogHeader><form onSubmit={submit}>
   <div className="cassino-type" role="radiogroup" aria-label="Tipo">{(['Ganho','Perda'] as const).map(t=><button key={t} type="button" role="radio" aria-checked={type===t} className={'cassino-type-option '+(type===t?(t==='Ganho'?'is-gain':'is-loss'):'')} disabled={busy} onClick={()=>setType(t)}>{t==='Ganho'?<TrendingUp size={16}/>:<TrendingDown size={16}/>}{t}</button>)}</div>
   <div className="form-grid" style={{marginTop:18}}>
    <label className="field">Valor (R$)<input required type="number" min="0.01" step="0.01" value={amountInput} onChange={e=>setAmountInput(e.target.value)} disabled={busy} autoFocus/></label>
    <label className="field">Data<input required type="date" value={dateInput} onChange={e=>setDateInput(e.target.value)} disabled={busy}/></label>
   </div>
   {accounts.length?<PersonAccountPicker accounts={accounts} value={accountId} onChange={setAccountId} disabled={busy}/>:<p className="hint">Nenhuma conta cadastrada ainda.</p>}
   <label className="field" style={{marginTop:18}}>Observação (opcional)<input maxLength={300} value={note} onChange={e=>setNote(e.target.value)} disabled={busy} placeholder="Ex.: roleta, slots, bônus"/></label>
   {error&&<p className="error" role="alert">{error}</p>}<div className="form-actions"><button type="button" className="secondary" disabled={busy} onClick={()=>setOpen(false)}>Cancelar</button><button className="primary" disabled={busy||disabled||!accounts.length}>{busy?'Salvando…':editing?'Salvar edição':type==='Ganho'?'Registrar ganho':'Registrar perda'}</button></div>
  </form></DialogContent></Dialog>
  <Dialog open={!!deleteTarget} onOpenChange={v=>{if(!v&&!busy)setDeleteTarget(null);}}><DialogContent><DialogHeader><DialogTitle>Excluir registro?</DialogTitle><DialogDescription>{deleteTarget?.label} · O saldo da conta volta ao que era antes deste registro. Esta ação não pode ser desfeita.</DialogDescription></DialogHeader>{error&&<p className="error" role="alert">{error}</p>}<div className="form-actions"><button className="secondary" disabled={busy} onClick={()=>setDeleteTarget(null)}>Cancelar</button><button className="primary negative" disabled={busy||disabled} onClick={()=>{if(deleteTarget)void send({action:'delete',id:deleteTarget.id,revision:deleteTarget.revision});}}>{busy?'Excluindo…':'Excluir registro'}</button></div></DialogContent></Dialog>
 </div>;
}
