#!/usr/bin/env python3
"""Atualiza a funcionalidade Alavancagem 1,3/Individual.

Uso, na pasta principal do projeto:
    python aplicar-atualizacao.py

Ou informando outra pasta:
    python aplicar-atualizacao.py /caminho/do/projeto

O programa cria uma cópia .bak antes de alterar qualquer arquivo e interrompe
sem gravar se não encontrar exatamente os trechos esperados.
"""
from __future__ import annotations

import shutil
import sys
from pathlib import Path


FILES = {
    "logic": ("lib/alavancagem.ts", "src/lib/alavancagem.ts"),
    "panel": ("components/alavancagem.tsx", "src/components/alavancagem.tsx"),
    "route": ("app/api/alavancagem/route.ts", "src/app/api/alavancagem/route.ts"),
}


def locate(root: Path, choices: tuple[str, ...]) -> Path:
    for name in choices:
        candidate = root / name
        if candidate.is_file():
            return candidate
    raise FileNotFoundError("Não encontrei: " + " ou ".join(choices))


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"Trecho esperado não encontrado uma única vez ({label}); ocorrências: {count}")
    return text.replace(old, new, 1)


def write_backup(path: Path, content: str) -> None:
    backup = path.with_name(path.name + ".bak")
    if not backup.exists():
        shutil.copy2(path, backup)
    path.write_text(content, encoding="utf-8")


def update_logic(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    text = replace_once(text, "export type Entry={group?:Group;sequence:number;cycle:number;stake:number;prize:number;result:'Pendente'|'Green'|'Red';event:string;date:string};", "export type Entry={group?:Group;sequence:number;cycle:number;stake:number;prize:number;odd:number;market:string;account:string;house:string;result:'Pendente'|'Green'|'Red';event:string;date:string};", "tipo Entry")
    text = replace_once(text, "const reset=!last||last.data.result==='Red'||last.data.prize>5000;\n return {stake:reset?1000:last.data.prize,sequence:(last?.data.sequence||0)+1,cycle:!last?1:last.data.cycle+(reset?1:0)};", "const reset=!last||last.data.result==='Red'||last.data.prize>=50;\n return {stake:reset?10:last.data.prize,sequence:(last?.data.sequence||0)+1,cycle:!last?1:last.data.cycle+(reset?1:0)};", "cálculo da próxima stake")
    text = replace_once(text, "return {...entry,result,prize:result==='Green'?Math.round(entry.stake*130/100):0};", "return {...entry,result,prize:result==='Green'?Math.round(entry.stake*entry.odd*100)/100:0};", "cálculo do prêmio")
    write_backup(path, text)


def update_route(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    text = replace_once(text, "event:z.string().trim().min(1).max(200),date:z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/),expectedSequence:z.number().int().positive()", "event:z.string().trim().min(1).max(200),date:z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/),odd:z.number().min(1.3).max(1.6),market:z.string().trim().min(1).max(120),account:z.string().trim().min(1).max(120),house:z.string().trim().min(1).max(120),expectedSequence:z.number().int().positive()", "campos da criação")
    text = replace_once(text, "const data={...next,group:body.group,event:body.event,date:body.date,result:'Pendente',prize:0};", "const data={...next,group:body.group,event:body.event,date:body.date,odd:body.odd,market:body.market,account:body.account,house:body.house,result:'Pendente',prize:0};", "dados da criação")
    write_backup(path, text)


def update_panel(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    text = replace_once(text, "const [open,setOpen]=useState(false),[event,setEvent]=useState(''),[date,setDate]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[confirm,setConfirm]=useState<{id:string;revision:number;result:'Green'|'Red';event:string;stake:number}|null>(null);", "const [open,setOpen]=useState(false),[event,setEvent]=useState(''),[date,setDate]=useState(''),[odd,setOdd]=useState('1.30'),[market,setMarket]=useState(''),[account,setAccount]=useState(''),[house,setHouse]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[confirm,setConfirm]=useState<{id:string;revision:number;result:'Green'|'Red';event:string;stake:number}|null>(null);", "campos do formulário")
    text = replace_once(text, "setCreation(next);setEvent('');const now=new Date();", "setCreation(next);setEvent('');setOdd('1.30');setMarket('');setAccount('');setHouse('');const now=new Date();", "limpeza do formulário")
    text = replace_once(text, "<span>{pending?'Stake da entrada pendente':'Stake da próxima entrada'} · odd 1,30</span>", "<span>{pending?'Stake da entrada pendente':'Stake da próxima entrada'} · odd variável</span>", "texto da stake")
    text = replace_once(text, "<strong>{money(pending?.data.stake??next?.stake??1000)}</strong>", "<strong>{money(pending?.data.stake??next?.stake??10)}</strong>", "stake inicial")
    text = replace_once(text, "last?.data.result==='Green'&&last.data.prize>5000?'Meta ultrapassada! O próximo ciclo começa com R$ 10,00.':'Green: reinveste o prêmio total. Red: reinicia em R$ 10,00.'", "last?.data.result==='Green'&&last.data.prize>=50?'Meta atingida! O próximo ciclo começa com R$ 10,00.':'Green: reinveste o prêmio total. Red: reinicia em R$ 10,00.'", "mensagem da sequência")
    text = replace_once(text, "O prêmio inclui a stake. Ao ultrapassar R$ 50,00, o ciclo termina.", "O prêmio inclui a stake. Ao atingir R$ 50,00, o ciclo termina.", "mensagem da meta")
    text = text.replace("r.data.result==='Green'&&r.data.prize>5000", "r.data.result==='Green'&&r.data.prize>=50")
    text = text.replace("· Odd: <b>1,30</b>", "· Odd: <b>{r.data.odd?.toFixed(2).replace('.',',')??'1,30'}</b>")
    text = replace_once(text, "A entrada será registrada como pendente.</DialogDescription></DialogHeader><form onSubmit={e=>{e.preventDefault();if(creation)void send({action:'create',group,event,date,expectedSequence:creation.sequence});}}>", "A entrada será registrada como pendente.</DialogDescription></DialogHeader><form onSubmit={e=>{e.preventDefault();if(creation)void send({action:'create',group,event,date,odd:Number(odd),market,account,house,expectedSequence:creation.sequence});}}>", "envio dos novos campos")
    text = replace_once(text, "<label className=\"field\">Data<input required type=\"date\" value={date} onChange={e=>setDate(e.target.value)} disabled={busy}/></label>", "<label className=\"field\">Data<input required type=\"date\" value={date} onChange={e=>setDate(e.target.value)} disabled={busy}/></label><label className=\"field\">Odd<input required type=\"number\" min=\"1.30\" max=\"1.60\" step=\"0.01\" value={odd} onChange={e=>setOdd(e.target.value)} disabled={busy}/></label><label className=\"field\">Mercado<input required maxLength={120} value={market} onChange={e=>setMarket(e.target.value)} disabled={busy}/></label><label className=\"field\">Conta<input required maxLength={120} value={account} onChange={e=>setAccount(e.target.value)} disabled={busy}/></label><label className=\"field\">Casa<input required maxLength={120} value={house} onChange={e=>setHouse(e.target.value)} disabled={busy}/></label>", "campos editáveis do formulário")
    write_backup(path, text)


def main() -> int:
    root = Path(sys.argv[1]).expanduser().resolve() if len(sys.argv) > 1 else Path.cwd()
    try:
        paths = {key: locate(root, choices) for key, choices in FILES.items()}
        update_logic(paths["logic"])
        update_route(paths["route"])
        update_panel(paths["panel"])
    except Exception as exc:
        print(f"ERRO: {exc}")
        print("Nenhuma atualização deve ser considerada concluída. Confira os arquivos .bak antes de tentar novamente.")
        return 1
    print("Atualização aplicada com sucesso.")
    print("Cópias de segurança .bak foram criadas para os três arquivos alterados.")
    print("Próximos comandos:")
    print("  pnpm run lint")
    print("  pnpm run build")
    print("  git add . && git commit -m \"Atualiza alavancagem com odd e campos da aposta\"")
    print("  git push origin main")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
