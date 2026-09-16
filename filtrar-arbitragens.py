from pathlib import Path
import json, shutil, tempfile
root=Path.cwd()
page=root/'app/page.tsx'
target=root/'components/person-account-picker.tsx'
pairs=json.loads('[["import {BanksPanel} from \'@/components/banks\';", "import {BanksPanel} from \'@/components/banks\';\\nimport {PersonAccountPicker} from \'@/components/person-account-picker\';"], ["<Choice label={b.groupId?\'Conta desta parte\':\'Conta\'} value={b.account} onChange={(v:string)=>changeBet(i,\'account\',v)} items={accountOptions}/>", "<PersonAccountPicker accounts={s.accounts} label={b.groupId?\'Casa / conta desta parte\':\'Casa / conta\'} value={b.account} onChange={(v:string)=>changeBet(i,\'account\',v)} disabled={loading||!!error||saving||deleting}/>"], ["<Choice label=\\"Conta que receberá a freebet\\" value={draft.promo.account} onChange={(v:string)=>setPromo(\'account\',v)} items={accountOptions}/>", "<PersonAccountPicker accounts={s.accounts} label=\\"Casa que receberá a freebet\\" value={draft.promo.account} onChange={(v:string)=>setPromo(\'account\',v)} disabled={loading||!!error||saving||deleting}/>"]]')
content='"use client";\nimport {useState} from \'react\';\nimport {Select,SelectTrigger,SelectContent,SelectItem,SelectValue} from \'@/components/ui/select\';\n\ntype Account={id:string;house:string;holder:string};\nconst personKey=(name:string)=>name.normalize(\'NFKC\').trim().replace(/\\s+/g,\' \').toLocaleLowerCase(\'pt-BR\');\nexport function PersonAccountPicker({accounts,value,onChange,disabled=false,label=\'Casa / conta\'}:{accounts:Account[];value:string;onChange:(id:string)=>void;disabled?:boolean;label?:string}){\n const [chosenPerson,setChosenPerson]=useState(\'\');\n const current=accounts.find(a=>a.id===value);\n const people=[...new Map(accounts.map(a=>[personKey(a.holder),a.holder])).entries()].sort((a,b)=>a[1].localeCompare(b[1],\'pt-BR\'));\n const person=current?personKey(current.holder):chosenPerson;\n const visible=accounts.filter(a=>personKey(a.holder)===person).sort((a,b)=>a.house.localeCompare(b.house,\'pt-BR\')||a.id.localeCompare(b.id));\n return <div className="account-selectors" style={{gridColumn:\'1 / -1\',marginBottom:0}}>\n  <label className="field">Pessoa\n   <Select value={people.some(([id])=>id===person)?person:\'\'} disabled={disabled} onValueChange={next=>{setChosenPerson(next);if(next!==person)onChange(\'\');}}>\n    <SelectTrigger className="picker"><SelectValue placeholder="Selecione a pessoa"/></SelectTrigger>\n    <SelectContent>{people.map(([id,name])=><SelectItem key={id} value={id}>{name}</SelectItem>)}</SelectContent>\n   </Select>\n  </label>\n  <label className="field">{label}\n   <Select value={current?.id||\'\'} disabled={disabled||!person||!visible.length} onValueChange={onChange}>\n    <SelectTrigger className="picker"><SelectValue placeholder={person?\'Selecione a casa\':\'Escolha primeiro a pessoa\'}/></SelectTrigger>\n    <SelectContent>{visible.map(a=><SelectItem key={a.id} value={a.id}>{a.house}</SelectItem>)}</SelectContent>\n   </Select>\n  </label>\n </div>;\n}\n'
if not page.is_file(): raise SystemExit('Execute no terminal da pasta /workspaces/planilha-manel.')
text=page.read_text()
for before,after in pairs:
    if after in text: continue
    if text.count(before)!=1: raise SystemExit('O formulario mudou. Envie app/page.tsx para adaptar sem perder alteracoes.')
    text=text.replace(before,after,1)
if target.exists() and target.read_text()!=content:
    raise SystemExit('O seletor ja existe com alteracoes. Envie components/person-account-picker.tsx.')
backup=Path(tempfile.mkdtemp(prefix='planilha-filtro-arbitragem-'))
shutil.copy2(page,backup/'page.tsx')
target.parent.mkdir(parents=True,exist_ok=True)
target.write_text(content)
page.write_text(text)
print('Atualizacao aplicada: selecione a pessoa e depois a casa em cada aposta.')
print('Backup: '+str(backup))
print('Proximo comando: pnpm build')
