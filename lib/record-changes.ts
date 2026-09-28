import type {RecordItem} from './banca';

// Bind the validated snapshot to the write itself. This also prevents a concurrent
// freebet bet from being inserted after its source arbitrage has been deleted.
export function recordsSnapshot(rows:RecordItem[]):string {
 return [...rows].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0).map(r=>r.id+':'+r.revision).join('|');
}
const snapshotSql="COALESCE((SELECT group_concat(token, '|') FROM (SELECT id || ':' || revision AS token FROM records ORDER BY id)), '') = ?";
export const insertRecordSql=`INSERT INTO records (id,kind,data,revision) SELECT ?,?,?,1 WHERE ${snapshotSql}`;
export const updateRecordSql=`UPDATE records SET data=?, revision=revision+1 WHERE id=? AND revision=? AND ${snapshotSql}`;
export const deleteArbitrageSql=`DELETE FROM records WHERE id=? AND kind='arb' AND revision=? AND ${snapshotSql}`;
export const deleteAlavancagemSql=`DELETE FROM records WHERE id=? AND kind='alavancagem' AND revision=? AND ${snapshotSql}`;
export const deleteOdd5Sql=`DELETE FROM records WHERE id=? AND kind='odd5' AND revision=? AND ${snapshotSql}`;
export const deleteCamiloSql=`DELETE FROM records WHERE id=? AND kind='camilo' AND revision=? AND ${snapshotSql}`;
export const deleteAvulsaSql=`DELETE FROM records WHERE id=? AND kind='avulsa' AND revision=? AND ${snapshotSql}`;
export const deleteCassinoSql=`DELETE FROM records WHERE id=? AND kind='cassino' AND revision=? AND ${snapshotSql}`;

/**
 * Tudo o que ainda aponta para uma conta: movimentações, apostas/promoções de
 * arbitragem e as entradas das abas Alavancagem, ODD 5, Camilo, Entrada avulsa
 * e Cassino. Entradas antigas sem accountId são casadas por titular + casa.
 * Usado pela tela e pela API para bloquear a exclusão de uma conta em uso.
 */
export function accountDependencies(rows:RecordItem[],accountId:string){
 const norm=(v:string)=>(v||'').normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('pt-BR');
 const acc=rows.find(r=>r.kind==='account'&&r.id===accountId);
 const entry=(d:any)=>d.accountId===accountId||(!!acc&&norm(d.account)===norm(acc.data.holder)&&norm(d.house)===norm(acc.data.house));
 const count=(kind:string,test:(d:any)=>boolean)=>rows.filter(r=>r.kind===kind&&test(r.data)).length;
 const deps={
  'movimentações':count('movement',d=>d.account===accountId),
  'apostas ou freebets de arbitragem':count('arb',d=>(d.bets||[]).some((b:any)=>b.account===accountId)||d.promo?.account===accountId),
  'entradas de Alavancagem':count('alavancagem',entry),
  'entradas de ODD 5':count('odd5',entry),
  'entradas da Camilo':count('camilo',entry),
  'entradas avulsas':count('avulsa',entry),
  'registros de Cassino':count('cassino',entry),
 };
 const found=Object.entries(deps).filter(([,n])=>n>0);
 return {total:found.reduce((sum,[,n])=>sum+n,0),labels:found.map(([label,n])=>n+' '+label),byKind:deps};
}
export const hasAccountDependencies=(rows:RecordItem[],accountId:string)=>accountDependencies(rows,accountId).total>0;

export function freebetDependents(rows:RecordItem[],id:string):RecordItem[] {
 return rows.filter(r=>r.kind==='arb'&&r.id!==id&&r.data.bets.some((b:any)=>b.capital==='Freebet'&&b.lot==='promo:'+id));
}
