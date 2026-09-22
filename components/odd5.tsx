"use client";
import {useRef,useState} from 'react';
import {Plus,Trash2,Settings,Pencil,X} from 'lucide-react';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {money,RecordItem,summary} from '@/lib/banca';
import {odd5Entries,odd5Balance,odd5Counts,odd5DefaultStake,odd5OddDefault} from '@/lib/odd5';
import {PersonAccountPicker} from '@/components/person-account-picker';
import {apiFetch} from '@/lib/api-client';
type PanelProps={rows:RecordItem[];disabled:boolean;onUpdated:()=>Promise<unknown>};
const blankMarkets=()=>[''];
export function Odd5Panel({rows,disabled,onUpdated}:PanelProps){
 const accounts=summary(rows).accounts;
 const entries=odd5Entries(rows);
 const balance=odd5Balance(rows);
 const counts=odd5Counts(rows);
 const defaultStake=odd5DefaultStake(rows);
 const [open,setOpen]=useState(false),[editing,setEditing]=useState<{id:string;revision:number}|null>(null);
 const [event,setEvent]=useState(''),[markets,setMarkets]=useState<string[]>(blankMarkets()),[odd,setOdd]=useState(odd5OddDefault),[stakeInput,setStakeInput]=useState(''),[accountId,setAccountId]=useState('');
 const [error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [confirm,setConfirm]=useState<{id:string;revision:number;result:'Green'|'Red';event:string;stake:number;odd:number}|null>(null);
 const [deleteTarget,setDeleteTarget]=useState<{id:string;revision:number;event:string}|null>(null);
 const [settingsOpen,setSettingsOpen]=useState(false),[defaultStakeInput,setDefaultStakeInput]=useState('');
 const lock=useRef(false);
 async function send(body:unknown){if(lock.current)return;lock.current=true;setBusy(true);setError('');try{
  const response=await apiFetch('/api/odd5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data:any=await response.json();if(!response.ok)throw new Error(data.error||'Não foi possível salvar.');
  setOpen(false);setConfirm(null);setDeleteTarget(null);setSettingsOpen(false);setEditing(null);await onUpdated();
 }catch(e){setError(e instanceof Error?e.message:'Falha na conexão. Sincronize antes de tentar novamente.');}finally{lock.current=false;setBusy(false);}}
 function startCreate(){setEditing(null);setEvent('');setMarkets(blankMarkets());setOdd(odd5OddDefault);setStakeInput((defaultStake/100).toFixed(2));setAccountId('');setError('');setOpen(true);}
 function startEdit(r:any){setEditing({id:r.id,revision:r.revision});setEvent(r.data.event);setMarkets(r.data.markets?.length?r.data.markets:blankMarkets());setOdd(String(r.data.odd));setStakeInput((r.data.stake/100).toFixed(2));setAccountId(r.data.accountId||'');setError('');setOpen(true);}
 function submit(e:any){
  e.preventDefault();
  const picked=accounts.find(a=>a.id===accountId);
  if(!picked){setError('Selecione a pessoa e a casa.');return;}
  const cents=Math.round(Number(stakeInput.replace(',','.'))*100);
  if(!Number.isFinite(cents)||cents<=0){setError('Informe um valor de stake válido.');return;}
  const cleanMarkets=markets.map(m=>m.trim()).filter(Boolean);
  if(!cleanMarkets.length){setError('Informe o mercado de pelo menos uma seleção.');return;}
  const oddValue=Number(String(odd).replace(',','.'));
  if(!Number.isFinite(oddValue)||oddValue<1.01){setError('Informe uma odd válida.');return;}
  if(editing)void send({action:'edit',id:editing.id,revision:editing.revision,event,markets:cleanMarkets,odd:oddValue,stake:cents,accountId});
  else void send({action:'create',event,markets:cleanMarkets,odd:oddValue,stake:cents,accountId});
 }
 return <div>
  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:12,flexWrap:'wrap'}}>
   <p className="hint" style={{margin:0,flex:'1 1 260px'}}>Registre suas entradas na odd 5. A stake padrão vale para novas entradas; ajuste por aposta sempre que precisar.</p>
   <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:8}}>
    <div style={{background:'#fff',border:'1px solid #e0e7e9',borderRadius:10,padding:'10px 16px',minWidth:190,textAlign:'right'}}>
     <small style={{margin:0}}>Saldo ODD 5</small>
     <strong className={balance<0?'negative':balance>0?'positive':''} style={{display:'block',fontSize:20,marginTop:4}}>{money(balance)}</strong>
    </div>
    <button type="button" className="text-button" style={{display:'inline-flex',alignItems:'center',gap:4,whiteSpace:'nowrap'}} disabled={disabled||busy} onClick={()=>{setError('');setDefaultStakeInput((defaultStake/100).toFixed(2));setSettingsOpen(true);}}><Settings size={14}/>Stake padrão: {money(defaultStake)}</button>
   </div>
  </div>
  <section className="stats" style={{margin:'16px 0'}}>
   <div className="stat"><span>Entradas</span><strong>{counts.total}</strong><small>{counts.pending} pendente(s)</small></div>
   <div className="stat"><span>Green</span><strong className="positive">{counts.green}</strong><small>de {counts.total} entradas</small></div>
   <div className="stat"><span>Red</span><strong className="negative">{counts.red}</strong><small>de {counts.total} entradas</small></div>
  </section>
  <button type="button" className="primary" disabled={disabled||busy||!accounts.length} onClick={startCreate}><Plus size={18}/>Nova entrada</button>
  {!accounts.length&&<p className="hint">Cadastre uma conta na aba Contas antes de registrar uma entrada.</p>}
  {error&&!open&&!confirm&&!deleteTarget&&!settingsOpen&&<p className="error" role="alert">{error}</p>}
  <div className="account-grid" style={{marginTop:20}}>{[...entries].reverse().map(r=><article key={r.id} className="account-card">
   <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8}}>
    <small>{r.data.account} · {r.data.house}</small>
    <div style={{display:'flex',gap:10}}>
     <button type="button" className="text-button" style={{display:'inline-flex',alignItems:'center',gap:4}} disabled={disabled||busy} onClick={()=>startEdit(r)} aria-label={'Editar entrada '+r.data.event}><Pencil size={14}/>Editar</button>
     <button type="button" className="text-button negative" style={{display:'inline-flex',alignItems:'center',gap:4}} disabled={disabled||busy} onClick={()=>{setError('');setDeleteTarget({id:r.id,revision:r.revision,event:r.data.event});}} aria-label={'Excluir entrada '+r.data.event}><Trash2 size={14}/>Excluir</button>
    </div>
   </div>
   <h3>{r.data.event}</h3><span className={'pill '+(r.data.result==='Green'?'done':'')}>{r.data.result}</span>
   <p>{(r.data.markets||[]).join(' · ')}</p>
   <p>Stake: <b>{money(r.data.stake)}</b> · Odd: <b>{Number(r.data.odd).toFixed(2).replace('.',',')}</b></p>
   <small>{r.data.result==='Pendente'?'Prêmio se der Green':'Prêmio total'}</small>
   <strong>{money(r.data.result==='Pendente'?Math.round(r.data.stake*r.data.odd*100)/100:r.data.prize)}</strong>
   {r.data.result==='Pendente'&&<div className="account-actions">{(['Green','Red'] as const).map(result=><button key={result} type="button" disabled={disabled||busy} onClick={()=>{setError('');setConfirm({id:r.id,revision:r.revision,result,event:r.data.event,stake:r.data.stake,odd:r.data.odd});}}>{result}</button>)}</div>}
  </article>)}</div>
  {!entries.length&&<div className="quiet-empty">Registre a primeira entrada com stake de {money(defaultStake)}.</div>}
  <Dialog open={open} onOpenChange={v=>{if(!busy)setOpen(v);}}><DialogContent className="editor"><DialogHeader><DialogTitle>{editing?'Editar entrada':'Nova entrada'}</DialogTitle><DialogDescription>Stake padrão de {money(defaultStake)}. Ajuste o valor e a odd conforme a aposta.</DialogDescription></DialogHeader><form onSubmit={submit}>
   <label className="field">Evento<input required maxLength={200} value={event} onChange={e=>setEvent(e.target.value)} disabled={busy} placeholder="Ex.: Time A x Time B"/></label>
   <div className="combination-editor"><b>Mercado{markets.length>1?'s (múltipla)':''}</b>
    {markets.map((m,i)=><div className="combination-leg" key={i}><div className="section-title"><span>{markets.length>1?'Seleção '+(i+1):'Mercado'}</span>{markets.length>1&&<button type="button" aria-label={'Remover seleção '+(i+1)} onClick={()=>setMarkets(markets.filter((_,j)=>j!==i))}><X size={16}/></button>}</div><label className="field">Obs<input maxLength={200} value={m} onChange={e=>setMarkets(markets.map((v,j)=>j===i?e.target.value:v))} disabled={busy} placeholder="Ex.: Mais de 2,5 gols"/></label></div>)}
    <button type="button" className="secondary" disabled={busy||markets.length>=20} onClick={()=>setMarkets([...markets,''])}><Plus size={16}/>Adicionar seleção (múltipla)</button>
   </div>
   <div className="form-grid" style={{marginTop:18}}>
    <label className="field">Odd<input required type="number" min="1.01" step="0.01" value={odd} onChange={e=>setOdd(e.target.value)} disabled={busy}/></label>
    <label className="field">Stake (R$)<input required type="number" min="0.01" step="0.01" value={stakeInput} onChange={e=>setStakeInput(e.target.value)} disabled={busy}/></label>
   </div>
   {accounts.length?<PersonAccountPicker accounts={accounts} value={accountId} onChange={setAccountId} disabled={busy}/>:<p className="hint">Nenhuma conta cadastrada ainda.</p>}
   {(()=>{const cents=Math.round(Number(stakeInput.replace(',','.'))*100);const oddValue=Number(String(odd).replace(',','.'));return Number.isFinite(cents)&&cents>0&&Number.isFinite(oddValue)?<p className="hint">Prêmio se der Green: <b>{money(Math.round(cents*oddValue*100)/100)}</b></p>:null;})()}
   {error&&<p className="error" role="alert">{error}</p>}<div className="form-actions"><button type="button" className="secondary" disabled={busy} onClick={()=>setOpen(false)}>Cancelar</button><button className="primary" disabled={busy||disabled||!accounts.length}>{busy?'Salvando…':editing?'Salvar edição':'Registrar entrada'}</button></div>
  </form></DialogContent></Dialog>
  <Dialog open={!!confirm} onOpenChange={v=>{if(!v&&!busy)setConfirm(null);}}><DialogContent><DialogHeader><DialogTitle>Confirmar {confirm?.result}?</DialogTitle><DialogDescription>{confirm?.event} · Prêmio total: {money(confirm?.result==='Green'?Math.round((confirm.stake*confirm.odd)*100)/100:0)}.</DialogDescription></DialogHeader>{error&&<p className="error" role="alert">{error}</p>}<div className="form-actions"><button className="secondary" disabled={busy} onClick={()=>setConfirm(null)}>Cancelar</button><button className="primary" disabled={busy||disabled} onClick={()=>{if(confirm)void send({action:'settle',id:confirm.id,revision:confirm.revision,result:confirm.result});}}>{busy?'Salvando…':'Confirmar resultado'}</button></div></DialogContent></Dialog>
  <Dialog open={!!deleteTarget} onOpenChange={v=>{if(!v&&!busy)setDeleteTarget(null);}}><DialogContent><DialogHeader><DialogTitle>Excluir entrada?</DialogTitle><DialogDescription>{deleteTarget?.event} · Esta ação remove a entrada do histórico e não pode ser desfeita.</DialogDescription></DialogHeader>{error&&<p className="error" role="alert">{error}</p>}<div className="form-actions"><button className="secondary" disabled={busy} onClick={()=>setDeleteTarget(null)}>Cancelar</button><button className="primary negative" disabled={busy||disabled} onClick={()=>{if(deleteTarget)void send({action:'delete',id:deleteTarget.id,revision:deleteTarget.revision});}}>{busy?'Excluindo…':'Excluir entrada'}</button></div></DialogContent></Dialog>
  <Dialog open={settingsOpen} onOpenChange={v=>{if(!busy)setSettingsOpen(v);}}><DialogContent><DialogHeader><DialogTitle>Stake padrão da ODD 5</DialogTitle><DialogDescription>Valor sugerido em toda nova entrada. Você ainda pode ajustar por aposta.</DialogDescription></DialogHeader><form onSubmit={e=>{e.preventDefault();const cents=Math.round(Number(defaultStakeInput.replace(',','.'))*100);if(!Number.isFinite(cents)||cents<100){setError('Informe um valor válido (mínimo R$ 1,00).');return;}void send({action:'set-default-stake',value:cents});}}>
   <label className="field">Novo valor padrão (R$)<input required type="number" min="1" step="0.01" value={defaultStakeInput} onChange={e=>setDefaultStakeInput(e.target.value)} disabled={busy}/></label>
   {error&&<p className="error" role="alert">{error}</p>}<div className="form-actions"><button type="button" className="secondary" disabled={busy} onClick={()=>setSettingsOpen(false)}>Cancelar</button><button className="primary" disabled={busy}>{busy?'Salvando…':'Salvar'}</button></div>
  </form></DialogContent></Dialog>
 </div>;
}
