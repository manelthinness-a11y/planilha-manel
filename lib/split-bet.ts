export function splitBet(bets:any[],index:number,newId:string){
 const original=bets[index];
 if(!original||original.status!=="Pendente")throw new Error("Só é possível dividir uma aposta pendente.");
 if(bets.length>=60)throw new Error("Limite de 60 lançamentos por operação.");
 const groupId=original.groupId||original.id;
 const left=Math.ceil(original.stake/2),right=original.stake-left;
 const loss=original.previousLoss||0;const leftLoss=original.stake?Math.round(loss*left/original.stake):Math.ceil(loss/2);
 const parts=[{...original,groupId,stake:left,previousLoss:leftLoss},{...original,id:newId,groupId,account:"",lot:"",stake:right,previousLoss:loss-leftLoss,returned:0,reissued:false}];
 return [...bets.slice(0,index),...parts,...bets.slice(index+1)];
}
export function groupDetails(bets:any[],bet:any){const key=bet.groupId||bet.id;const keys=[...new Set(bets.map(b=>b.groupId||b.id))];const parts=bets.filter(b=>(b.groupId||b.id)===key);return {number:keys.indexOf(key)+1,count:parts.length,part:parts.findIndex(b=>b.id===bet.id)+1,total:parts.reduce((s,b)=>s+b.stake,0)};}
