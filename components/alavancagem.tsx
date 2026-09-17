"use client";
import {useRef,useState} from 'react';
import {Plus,Trash2} from 'lucide-react';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {money,RecordItem} from '@/lib/banca';
import {leverageEntries,nextLeverage,type Group} from '@/lib/alavancagem';
type PanelProps={rows:RecordItem[];disabled:boolean;onUpdated:()=>Promise<unknown>};
export function AlavancagemPanel(props:PanelProps){
 const [group,setGroup]=useState<Group>('alavancagem');
 return <div>
  <div role="tablist" aria-label="Registros de alavancagem" style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:20}}>
   {(['alavancagem','individual'] as const).map(value=><button type="button" role="tab" id={'tab-'+value} aria-controls={'panel-'+value} aria-selected={group===value} key={value} className={group===value?'primary':'secondary'} onClick={()=>setGroup(value)}>{value==='alavancagem'?'Alavancagem 1,3':'Individual'}</button>)}
  </div>
  {(['alavancagem','individual'] as const).map(value=><div key={value} role="tabpanel" id={'panel-'+value} aria-labelledby={'tab-'+value} hidden={group!==value}><LeverageRegister {...props} group={value}/></div>)}
 </div>;
}
function LeverageRegister({rows,disabled,onUpdated,group}:PanelProps&{group:Group}){
 const entries=leverageEntries(rows,group),pending=entries.find(r=>r.data.result==='Pendente');
 const next=pending?null:nextLeverage(rows,group);
 const [open,setOpen]=useState(false),[event,setEvent]=useState(''),[date,setDate]=useState(''),[odd,setOdd]=useState('1.30'),[market,setMarket]=useState(''),[account,setAccount]=useState(''),[house,setHouse]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[confirm,setConfirm]=useState<{id:string;revision:number;result:'Green'|'Red';event:string;stake:number;odd:number}|null>(null);
 const [deleteTarget,setDeleteTarget]=useState<{id:string;revision:number;event:string;sequence:number}|null>(null);
 const [creation,setCreation]=useState<{stake:number;sequence:number;cycle:number}|null>(null);
 const lock=useRef(false);
 async function send(body:unknown){if(lock.current)return;lock.current=true;setBusy(true);setError('');try{
  const response=await fetch('/api/alavancagem',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data=await response.json();if(!response.ok)throw new Error(data.error||'Não foi possível salvar.');
  setOpen(false);setConfirm(null);setDeleteTarget(null);await onUpdated();
 }catch(e){setError(e instanceof Error?e.message:'Falha na conexão. Sincronize antes de tentar novamente.');}finally{lock.current=false;setBusy(false);}}
 const last=entries.at(-1);
 return <div>
  <p className="hint">{group==='individual'?'Registros Individual':'Registros Alavancagem 1,3'} · Histórico e sequência de stakes independentes.</p>
  <button type="button" className="primary" disabled={disabled||busy||!!pending} onClick={()=>{setCreation(next);setEvent('');setOdd('1.30');setMarket('');setAccount('');setHouse('');const now=new Date();setDate([now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-'));setError('');setOpen(true);}}><Plus size={18}/>Nova entrada</button>
  <section className="person-balance" style={{maxWidth:600,margin:'20px 0'}}>
   <span>{pending?'Stake da entrada pendente':'Stake da próxima entrada'} · odd variável</span>
   <strong>{money(pending?.data.stake??next?.stake??1000)}</strong>
   <small>{pending?'Registre Green ou Red para liberar a próxima entrada.':last?.data.result==='Green'&&last.data.prize>=5000?'Meta atingida! O próximo ciclo começa com R$ 10,00.':'Green: reinveste o prêmio total. Red: reinicia em R$ 10,00.'}</small>
  </section>
  <p className="hint">O prêmio inclui a stake. Ao atingir R$ 50,00, o ciclo termina. Este controle não movimenta os saldos das abas Contas e Bancos.</p>
  {error&&!open&&!confirm&&!deleteTarget&&<p className="error" role="alert">{error}</p>}
  <div className="account-grid">{[...entries].reverse().map(r=><article key={r.id} className="account-card">
   <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8}}>
    <small>Entrada {r.data.sequence} · Ciclo {r.data.cycle} · {r.data.date.split('-').reverse().join('/')}</small>
    <button type="button" className="text-button negative" style={{display:'inline-flex',alignItems:'center',gap:4}} disabled={disabled||busy} onClick={()=>{setError('');setDeleteTarget({id:r.id,revision:r.revision,event:r.data.event,sequence:r.data.sequence});}} aria-label={'Excluir entrada '+r.data.sequence}><Trash2 size={14}/>Excluir</button>
   </div>
   <h3>{r.data.event}</h3><span className={'pill '+(r.data.result==='Green'?'done':'')}>{r.data.result}</span>
   <p>Stake: <b>{money(r.data.stake)}</b> · Odd: <b>{r.data.odd?.toFixed(2).replace('.',',')??'1,30'}</b></p>
   <small>{r.data.result==='Pendente'?'Prêmio se der Green':'Prêmio total'}</small>
   <strong>{money(r.data.result==='Pendente'?Math.round(r.data.stake*(r.data.odd??1.3)*100)/100:r.data.prize)}</strong>
   {r.data.result==='Green'&&r.data.prize>=5000&&<p className="positive">Meta ultrapassada · ciclo concluído</p>}
   {r.data.result==='Pendente'&&<div className="account-actions">{(['Green','Red'] as const).map(result=><button key={result} type="button" disabled={disabled||busy} onClick={()=>{setError('');setConfirm({id:r.id,revision:r.revision,result,event:r.data.event,stake:r.data.stake,odd:r.data.odd??1.3});}}>{result}</button>)}</div>}
  </article>)}</div>
  {!entries.length&&<div className="quiet-empty">Registre a primeira entrada com stake de R$ 10,00.</div>}
  <Dialog open={open} onOpenChange={v=>{if(!busy)setOpen(v);}}><DialogContent className="editor"><DialogHeader><DialogTitle>Nova entrada</DialogTitle><DialogDescription>Stake automática de {money(creation?.stake||1000)} · odd entre 1,30 e 1,60. A entrada será registrada como pendente.</DialogDescription></DialogHeader><form onSubmit={e=>{e.preventDefault();if(creation)void send({action:'create',group,event,date,odd:Number(odd),market,account,house,expectedSequence:creation.sequence});}}>
   <label className="field">Evento / descrição<input required maxLength={200} value={event} onChange={e=>setEvent(e.target.value)} disabled={busy} placeholder="Ex.: Time A x Time B — seleção"/></label>
   <label className="field">Data<input required type="date" value={date} onChange={e=>setDate(e.target.value)} disabled={busy}/></label><label className="field">Odd<input required type="number" min="1.30" max="1.60" step="0.01" value={odd} onChange={e=>setOdd(e.target.value)} disabled={busy}/></label><label className="field">Mercado<input required maxLength={120} value={market} onChange={e=>setMarket(e.target.value)} disabled={busy}/></label><label className="field">Conta<input required maxLength={120} value={account} onChange={e=>setAccount(e.target.value)} disabled={busy}/></label><label className="field">Casa<input required maxLength={120} value={house} onChange={e=>setHouse(e.target.value)} disabled={busy}/></label>
   {error&&<p className="error" role="alert">{error}</p>}<div className="form-actions"><button type="button" className="secondary" disabled={busy} onClick={()=>setOpen(false)}>Cancelar</button><button className="primary" disabled={busy||disabled}>{busy?'Salvando…':'Registrar entrada'}</button></div>
  </form></DialogContent></Dialog>
  <Dialog open={!!confirm} onOpenChange={v=>{if(!v&&!busy)setConfirm(null);}}><DialogContent><DialogHeader><DialogTitle>Confirmar {confirm?.result}?</DialogTitle><DialogDescription>{confirm?.event} · Prêmio total: {money(confirm?.result==='Green'?Math.round(confirm.stake*confirm.odd*100)/100:0)}. O resultado definirá a próxima stake.</DialogDescription></DialogHeader>{error&&<p className="error" role="alert">{error}</p>}<div className="form-actions"><button className="secondary" disabled={busy} onClick={()=>setConfirm(null)}>Cancelar</button><button className="primary" disabled={busy||disabled} onClick={()=>{if(confirm)void send({action:'settle',group,id:confirm.id,revision:confirm.revision,result:confirm.result});}}>{busy?'Salvando…':'Confirmar resultado'}</button></div></DialogContent></Dialog>
  <Dialog open={!!deleteTarget} onOpenChange={v=>{if(!v&&!busy)setDeleteTarget(null);}}><DialogContent><DialogHeader><DialogTitle>Excluir entrada {deleteTarget?.sequence}?</DialogTitle><DialogDescription>{deleteTarget?.event} · Esta ação remove a entrada do histórico e não pode ser desfeita. A sequência e o ciclo seguem de onde pararam.</DialogDescription></DialogHeader>{error&&<p className="error" role="alert">{error}</p>}<div className="form-actions"><button className="secondary" disabled={busy} onClick={()=>setDeleteTarget(null)}>Cancelar</button><button className="primary negative" disabled={busy||disabled} onClick={()=>{if(deleteTarget)void send({action:'delete',group,id:deleteTarget.id,revision:deleteTarget.revision});}}>{busy?'Excluindo…':'Excluir entrada'}</button></div></DialogContent></Dialog>
 </div>;
}
