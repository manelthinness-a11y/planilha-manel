"use client";
import {useState} from 'react';
import {Download,FileSpreadsheet,FileJson} from 'lucide-react';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import type {RecordItem} from '@/lib/banca';
import {exportCsv,exportJson,exportRows,exportFileName} from '@/lib/export';

// Botão "Exportar" da Visão geral: baixa os dados que já estão carregados na
// tela — planilha (CSV para o Excel) ou backup completo (JSON).

function download(name:string,content:string,type:string){
 const blob=new Blob([content],{type});
 const url=URL.createObjectURL(blob);
 const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
}

export function ExportDialog({rows,disabled}:{rows:RecordItem[];disabled:boolean}){
 const [open,setOpen]=useState(false);
 const lines=open?exportRows(rows).length:0;
 return <>
  <button type="button" className="secondary" disabled={disabled||!rows.length} onClick={()=>setOpen(true)} aria-label="Exportar dados"><Download size={18}/>Exportar</button>
  <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>Exportar dados</DialogTitle><DialogDescription>Baixa uma cópia de tudo o que está registrado ({rows.length} registros). Nada é alterado no app.</DialogDescription></DialogHeader>
   <div className="export-options">
    <button type="button" className="export-option" onClick={()=>{download(exportFileName('csv'),exportCsv(rows),'text/csv;charset=utf-8');setOpen(false);}}>
     <FileSpreadsheet size={22}/><span><b>Planilha (CSV)</b><small>Abre no Excel ou no Google Planilhas. {lines} linhas: uma por registro e, nas arbitragens, uma por aposta.</small></span>
    </button>
    <button type="button" className="export-option" onClick={()=>{download(exportFileName('json'),exportJson(rows),'application/json');setOpen(false);}}>
     <FileJson size={22}/><span><b>Backup completo (JSON)</b><small>Todos os registros exatamente como estão no banco. Guarde este arquivo — é o que permite restaurar os dados se algo acontecer.</small></span>
    </button>
   </div>
   <p className="hint">Dica: faça o backup completo de tempos em tempos e guarde fora do computador (nuvem ou e-mail).</p>
  </DialogContent></Dialog>
 </>;
}
