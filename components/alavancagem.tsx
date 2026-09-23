"use client";
import {useRef,useState} from 'react';
import {Plus,Trash2,Settings} from 'lucide-react';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {money,RecordItem,summary} from '@/lib/banca';
import {leverageEntries,nextLeverage,resetStakeFor,leverageNet,type Group,type Track} from '@/lib/alavancagem';
import {PersonAccountPicker} from '@/components/person-account-picker';
import {apiFetch} from '@/lib/api-client';
import {type PeriodFilter,inPeriod} from '@/lib/period-filter';
type PanelProps={rows:RecordItem[];disabled:boolean;onUpdated:()=>Promise<unknown>;period:PeriodFilter};
export function AlavancagemPanel(props:PanelProps&{track:Track}){
 const {track}=props;
 const [group,setGroup]=useState<Group>(track.mainGroup);
 const groups=[track.mainGroup,track.individualGroup];
 return <div>
  <div role="tablist" aria-label={'Registros de '+track.label} style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:20}}>
   {groups.map(value=><button type="button" role="tab" id={'tab-'+value} aria-controls={'panel-'+value} aria-selected={group===value} key={value} className={group===value?'primary':'secondary'} onClick={()=>setGroup(value)}>{value===track.mainGroup?track.label:'Individual'}</button>)}
  </div>
  {groups.map(value=><div key={value} role="tabpanel" id={'panel-'+value} aria-labelledby={'tab-'+value} hidden={group!==value}><LeverageRegister {...props} group={value}/></div>)}
 </div>;
}
function LeverageRegister({rows,disabled,onUpdated,group,track,period}:PanelProps&{group:Group;track:Track}){
 const allEntries=leverageEntries(rows,group),pending=allEntries.find(r=>r.data.result==='Pendente');
 const visibleEntries=allEntries.filter(r=>inPeriod(r.data.date,period));
 const next=pending?null:nextLeverage(rows,group);
 const accounts=summary(rows).accounts;
 const [open,setOpen]=useState(false),[event,setEvent]=useState(''),[date,setDate]=useState(''),[odd,setOdd]=useState(track.oddDefault),[market,setMarket]=useState(''),[accountId,setAccountId]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[confirm,setConfirm]=useState<{id:string;revision:number;result:'Green'|'Red';event:string;stake:number;odd:number}|null>(null);
 const [deleteTarget,setDeleteTarget]=useState<{id:string;revision:number;event:string;sequence:number}|null>(null);
 const [creation,setCreation]=useState<{stake:number;sequence:number;cycle:number}|null>(null);
 const [settingsOpen,setSettingsOpen]=useState(false),[stakeInput,setStakeInput]=useState('');
 const lock=useRef(false);
 async function send(body:unknown){if(lock.current)return;lock.current=true;setBusy(true);setError('');try{
  const response=await apiFetch('/api/alavancagem',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data=await response.json();if(!response.ok)throw new Error(data.error||'Não foi possível salvar.');
  setOpen(false);setConfirm(null);setDeleteTarget(null);setSettingsOpen(false);await onUpdated();
 }catch(e){setError(e instanceof Error?e.message:'Falha na conexão. Sincronize antes de tentar novamente.');}finally{lock.current=false;setBusy(false);}}
 const last=allEntries.at(-1);
 const defaultStake=resetStakeFor(rows,group);
 const net=leverageNet(rows,group);
 const isIndividual=group===track.individualGroup;
 const groupLabel=isIndividual?'Individual':track.label;
 const oddRangeLabel=track.oddMin.toFixed(2).replace('.',',')+' e '+track.oddMax.toFixed(2).replace('.',',');
 const fallbackOdd=Number(track.oddDefault);
 return <div>
  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:12,flexWrap:'wrap'}}>
   <p className="hint" style={{margin:0,flex:'1 1 260px'}}>Registros {groupLabel} · Histórico e sequência de stakes independentes.{!isIndividual&&' Cada entrada registrada aqui gera automaticamente uma entrada espelhada em Individual, com a stake padrão configurada.'}</p>
   <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:8}}>
    <div style={{background:'#fff',border:'1px solid #e0e7e9',borderRadius:10,padding:'10px 16px',minWidth:190,textAlign:'right'}}>
     <small style={{margin:0}}>Saldo {groupLabel}</small>
     <strong className={net<0?'negative':net>0?'positive':''} style={{display:'block',fontSize:20,marginTop:4}}>{money(net)}</strong>
    </div>
    <button type="button" className="text-button" style={{display:'inline-flex',alignItems:'center',gap:4,whiteSpace:'nowrap'}} disabled={disabled||busy} onClick={()=>{setError('');setStakeInput((defaultStake/100).toFixed(2));setSettingsOpen(true);}}><Settings size={14}/>Stake padrão: {money(defaultStake)}</button>
   </div>
  </div>
  <button type="button" className="primary" disabled={disabled||busy||!!pending} onClick={()=>{setCreation(next);setEvent('');setOdd(track.oddDefault);setMarket('');setAccountId('');const now=new Date();setDate([now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-'));setError('');setOpen(true);}}><Plus size={18}/>Nova entrada</button>
  <section className="person-balance" style={{maxWidth:600,margin:'20px 0'}}>
   <span>{pending?'Stake da entrada pendente':'Stake da próxima entrada'} · odd variável</span>
   <strong>{money(pending?.data.stake??next?.stake??defaultStake)}</strong>
   <small>{pending?'Registre Green ou Red para liberar a próxima entrada.':last?.data.result==='Green'&&last.data.prize>=5000?'Meta atingida! O próximo ciclo começa com '+money(defaultStake)+'.':'Green: reinveste o prêmio total. Red: reinicia em '+money(defaultStake)+'.'}</small>
  </section>
  <p className="hint">O prêmio inclui a stake. Ao atingir R$ 50,00, o ciclo termina. A stake fica reservada como &quot;em aberto&quot; na conta enquanto a entrada está pendente; no Red ela é descontada em definitivo e no Green o lucro entra no saldo real da conta selecionada.</p>
  {error&&!open&&!confirm&&!deleteTarget&&!settingsOpen&&<p className="error" role="alert">{error}</p>}
  <div className="account-grid">{[...visibleEntries].reverse().map(r=><article key={r.id} className="account-card">
   <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8}}>
    <small>Entrada {r.data.sequence} · Ciclo {r.data.cycle} · {r.data.date.split('-').reverse().join('/')}</small>
    <button type="button" className="text-button negative" style={{display:'inline-flex',alignItems:'center',gap:4}} disabled={disabled||busy} onClick={()=>{setError('');setDeleteTarget({id:r.id,revision:r.revision,event:r.data.event,sequence:r.data.sequence});}} aria-label={'Excluir entrada '+r.data.sequence}><Trash2 size={14}/>Excluir</button>
   </div>
   <h3>{r.data.event}</h3><span className={'pill '+(r.data.result==='Green'?'done':'')}>{r.data.result}</span>
   <p>Stake: <b>{money(r.data.stake)}</b> · Odd: <b>{(r.data.odd??fallbackOdd).toFixed(2).replace('.',',')}</b></p>
   <small>{r.data.result==='Pendente'?'Prêmio se der Green':'Prêmio total'}</small>
   <strong>{money(r.data.result==='Pendente'?Math.round(r.data.stake*(r.data.odd??fallbackOdd)*100)/100:r.data.prize)}</strong>
   {r.data.result==='Green'&&r.data.prize>=5000&&<p className="positive">Meta ultrapassada · ciclo concluído</p>}
   {r.data.result==='Pendente'&&<div className="account-actions">{(['Green','Red'] as const).map(result=><button key={result} type="button" disabled={disabled||busy} onClick={()=>{setError('');setConfirm({id:r.id,revision:r.revision,result,event:r.data.event,stake:r.data.stake,odd:r.data.odd??fallbackOdd});}}>{result}</button>)}</div>}
  </article>)}</div>
  {!allEntries.length&&<div className="quiet-empty">Registre a primeira entrada com stake de {money(defaultStake)}.</div>}
  {!!allEntries.length&&!visibleEntries.length&&<div className="quiet-empty">Nenhuma entrada no período selecionado.</div>}
  <Dialog open={open} onOpenChange={v=>{if(!busy)setOpen(v);}}><DialogContent className="editor"><DialogHeader><DialogTitle>Nova entrada</DialogTitle><DialogDescription>Stake automática de {money(creation?.stake||defaultStake)} · odd entre {oddRangeLabel}. A entrada será registrada como pendente e a stake ficará reservada no saldo da conta escolhida.</DialogDescription></DialogHeader><form onSubmit={e=>{e.preventDefault();const picked=accounts.find(a=>a.id===accountId);if(!picked){setError('Selecione a pessoa e a casa.');return;}if(creation)void send({action:'create',group,event,date,odd:Number(odd),market,account:picked.holder,house:picked.house,accountId:picked.id,expectedSequence:creation.sequence});}}>
   <label className="field">Evento / descrição<input required maxLength={200} value={event} onChange={e=>setEvent(e.target.value)} disabled={busy} placeholder="Ex.: Time A x Time B — seleção"/></label>
   <label className="field">Data<input required type="date" value={date} onChange={e=>setDate(e.target.value)} disabled={busy}/></label><label className="field">Odd<input required type="number" min={track.oddMin} max={track.oddMax} step="0.01" value={odd} onChange={e=>setOdd(e.target.value)} disabled={busy}/></label><label className="field">Mercado<input required maxLength={120} value={market} onChange={e=>setMarket(e.target.value)} disabled={busy}/></label>
   {accounts.length?<PersonAccountPicker accounts={accounts} value={accountId} onChange={setAccountId} disabled={busy} label="Casa"/>:<p className="hint">Nenhuma conta cadastrada ainda. Cadastre uma na aba Contas antes de registrar uma entrada.</p>}
   {error&&<p className="error" role="alert">{error}</p>}<div className="form-actions"><button type="button" className="secondary" disabled={busy} onClick={()=>setOpen(false)}>Cancelar</button><button className="primary" disabled={busy||disabled||!accounts.length}>{busy?'Salvando…':'Registrar entrada'}</button></div>
  </form></DialogContent></Dialog>
  <Dialog open={!!confirm} onOpenChange={v=>{if(!v&&!busy)setConfirm(null);}}><DialogContent><DialogHeader><DialogTitle>Confirmar {confirm?.result}?</DialogTitle><DialogDescription>{confirm?.event} · Prêmio total: {money(confirm?.result==='Green'?Math.round(confirm.stake*confirm.odd*100)/100:0)}. O resultado definirá a próxima stake e atualizará o saldo da conta vinculada.</DialogDescription></DialogHeader>{error&&<p className="error" role="alert">{error}</p>}<div className="form-actions"><button className="secondary" disabled={busy} onClick={()=>setConfirm(null)}>Cancelar</button><button className="primary" disabled={busy||disabled} onClick={()=>{if(confirm)void send({action:'settle',group,id:confirm.id,revision:confirm.revision,result:confirm.result});}}>{busy?'Salvando…':'Confirmar resultado'}</button></div></DialogContent></Dialog>
  <Dialog open={!!deleteTarget} onOpenChange={v=>{if(!v&&!busy)setDeleteTarget(null);}}><DialogContent><DialogHeader><DialogTitle>Excluir entrada {deleteTarget?.sequence}?</DialogTitle><DialogDescription>{deleteTarget?.event} · Esta ação remove a entrada do histórico e não pode ser desfeita. A sequência e o ciclo seguem de onde pararam.</DialogDescription></DialogHeader>{error&&<p className="error" role="alert">{error}</p>}<div className="form-actions"><button className="secondary" disabled={busy} onClick={()=>setDeleteTarget(null)}>Cancelar</button><button className="primary negative" disabled={busy||disabled} onClick={()=>{if(deleteTarget)void send({action:'delete',group,id:deleteTarget.id,revision:deleteTarget.revision});}}>{busy?'Excluindo…':'Excluir entrada'}</button></div></DialogContent></Dialog>
  <Dialog open={settingsOpen} onOpenChange={v=>{if(!busy)setSettingsOpen(v);}}><DialogContent><DialogHeader><DialogTitle>Stake padrão da {groupLabel}</DialogTitle><DialogDescription>{isIndividual?'Valor usado sempre que o ciclo reinicia (Red ou meta de R$ 50,00 atingida) e em toda entrada espelhada automaticamente a partir da '+track.label+'.':'Valor usado sempre que o ciclo desta aba reinicia (Red ou meta de R$ 50,00 atingida).'}</DialogDescription></DialogHeader><form onSubmit={e=>{e.preventDefault();const cents=Math.round(Number(stakeInput.replace(',','.'))*100);if(!Number.isFinite(cents)||cents<100){setError('Informe um valor válido (mínimo R$ 1,00).');return;}void send({action:'set-default-stake',group,value:cents});}}>
   <label className="field">Novo valor padrão (R$)<input required type="number" min="1" step="0.01" value={stakeInput} onChange={e=>setStakeInput(e.target.value)} disabled={busy}/></label>
   {error&&<p className="error" role="alert">{error}</p>}<div className="form-actions"><button type="button" className="secondary" disabled={busy} onClick={()=>setSettingsOpen(false)}>Cancelar</button><button className="primary" disabled={busy}>{busy?'Salvando…':'Salvar'}</button></div>
  </form></DialogContent></Dialog>
 </div>;
}
