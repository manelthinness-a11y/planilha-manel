from pathlib import Path
import json, shutil, tempfile
root=Path.cwd()
changes=json.loads('{"app/page.tsx": [["<button type=\\"button\\" className=\\"account-head account-edit\\"", "<button type=\\"button\\" className=\\"text-button negative\\" style={{alignSelf:\'flex-end\',display:\'inline-flex\',alignItems:\'center\',gap:6,marginBottom:12}} disabled={loading||!!error||saving||deleting} onClick={()=>{setDeleteError(\'\');setDeleteTarget(rows.find(r=>r.id===a.id)||null);}} aria-label={\'Excluir conta \'+a.house+\' · \'+a.holder}><Trash2 size={16}/>Excluir conta</button><button type=\\"button\\" className=\\"account-head account-edit\\""], ["<AlertDialogTitle>Excluir arbitragem?</AlertDialogTitle>", "<AlertDialogTitle>{deleteTarget?.kind===\'account\'?\'Excluir conta?\':\'Excluir arbitragem?\'}</AlertDialogTitle>"], ["<AlertDialogDescription>O registro de <strong>{deleteTarget?.data.event}</strong> será removido. Os saldos das contas e os resultados serão recalculados.</AlertDialogDescription>", "<AlertDialogDescription>{deleteTarget?.kind===\'account\'?<>A conta <strong>{deleteTarget.data.house} · {deleteTarget.data.holder}</strong> será excluída e seu saldo deixará de compor o total. Contas com movimentações, apostas ou créditos promocionais vinculados não podem ser excluídas. Esta ação não pode ser desfeita pela tela.</>:<>O registro de <strong>{deleteTarget?.data.event}</strong> será removido. Os saldos das contas e os resultados serão recalculados.</>}</AlertDialogDescription>"], ["{deleting?\'Excluindo…\':\'Excluir arbitragem\'}", "{deleting?\'Excluindo…\':deleteTarget?.kind===\'account\'?\'Excluir conta\':\'Excluir arbitragem\'}"], ["toast.success(updated?\'Arbitragem excluída. Saldos e resultados atualizados.\':\'Arbitragem excluída e totais recalculados. Não foi possível consultar novas alterações; tente sincronizar.\');", "toast.success(deleteTarget.kind===\'account\'?(updated?\'Conta excluída. Saldos atualizados.\':\'Conta excluída. Sincronize para consultar novas alterações.\'):(updated?\'Arbitragem excluída. Saldos e resultados atualizados.\':\'Arbitragem excluída e totais recalculados. Não foi possível consultar novas alterações; tente sincronizar.\'));"]], "app/api/records/route.ts": [[" if(!old||old.kind!==\'arb\')return Response.json", " if(old?.kind===\'account\'){\\n  if(old.revision!==body.revision)return Response.json({error:\'Esta conta mudou. Sincronize antes de excluir.\',code:\'stale\'},{status:409});\\n  const linked=rows.some((r:any)=>(r.kind===\'movement\'&&r.data.account===body.id)||(r.kind===\'arb\'&&(r.data.bets?.some((b:any)=>b.account===body.id)||r.data.promo?.account===body.id)));\\n  if(linked)return Response.json({error:\'Esta conta possui movimentações, apostas ou créditos promocionais vinculados. A exclusão foi bloqueada para preservar o histórico. Você pode editar o cadastro da conta.\',code:\'account_dependency\'},{status:409});\\n  const sql=\\"DELETE FROM records WHERE id=? AND kind=\'account\' AND revision=? AND COALESCE((SELECT group_concat(token, \'|\') FROM (SELECT id || \':\' || revision AS token FROM records ORDER BY id)), \'\') = ?\\";\\n  const result=await database().prepare(sql).bind(body.id,body.revision,recordsSnapshot(rows)).run();\\n  if(!result.meta.changes)return Response.json({error:\'Os dados mudaram. Sincronize e confira a conta antes de excluir.\',code:\'stale\'},{status:409});\\n  return Response.json({id:body.id,rows:rows.filter((r:any)=>r.id!==body.id)},{headers:{\'Cache-Control\':\'no-store\'}});\\n }\\n if(!old||old.kind!==\'arb\')return Response.json"]]}')
outputs={}
for name,pairs in changes.items():
    target=root/name
    if not target.is_file():
        raise SystemExit('Arquivo ausente: '+name+'. Execute em /workspaces/planilha-manel.')
    text=target.read_text()
    for before,after in pairs:
        if after in text: continue
        if text.count(before)!=1:
            raise SystemExit('O codigo mudou em '+name+'. Envie esse arquivo para adaptar sem perder alteracoes.')
        text=text.replace(before,after,1)
    outputs[name]=text
backup=Path(tempfile.mkdtemp(prefix='planilha-excluir-contas-'))
for name,text in outputs.items():
    target=root/name
    if target.read_text()==text: continue
    saved=backup/name
    saved.parent.mkdir(parents=True,exist_ok=True)
    shutil.copy2(target,saved)
    target.write_text(text)
print('Atualizacao aplicada: Excluir conta com confirmacao e protecao do historico.')
print('Backup: '+str(backup))
print('Proximo comando: pnpm build')
