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

export function freebetDependents(rows:RecordItem[],id:string):RecordItem[] {
 return rows.filter(r=>r.kind==='arb'&&r.id!==id&&r.data.bets.some((b:any)=>b.capital==='Freebet'&&b.lot==='promo:'+id));
}
