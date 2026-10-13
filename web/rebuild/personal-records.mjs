import {escapeHTML as e,number} from './core.mjs';
import {savePersonalRecord,readTrades} from './storage.mjs';
import {assetLedger,normalizeAssetTrade} from './assets.mjs';
export function validatePersonalRecord(value,symbol){
 if(!value||value.schemaVersion!==1||value.symbol!==symbol||typeof value.name!=='string'||!value.name||typeof value.note!=='string'||value.note.length>10000||typeof value.enabled!=='boolean'||!['above','below'].includes(value.direction)||typeof value.updatedAt!=='string'||(value.target!=null&&(!Number.isFinite(value.target)||value.target<=0))||(value.enabled&&value.target==null))throw Error('個人紀錄格式不符，原始內容已保留');
 return value;
}
export function reminderStatus(record,row){
 if(!record?.enabled)return '尚未啟用價格提醒';
 if(!row.eligible||!Number.isFinite(row.price)||row.price<=0)return '目前沒有可判斷的合格原始報價；設定仍保留。';
 const hit=record.direction==='above'?row.price>=record.target:row.price<=record.target;
 return `${hit?'已達設定條件':'尚未達設定條件'}・原始市價 ${number(row.price)}・${row.asOf||'資料日期不足'}`;
}
export function createPersonalRecords(host,{card,status}){
 let saving=false;const contexts=new Map();
 async function page(row){
  const key='rebuild.notes.v1.'+row.symbol,contextID=crypto.randomUUID(),context={row,original:null,ledger:null};contexts.set(contextID,context);
  let holding='';
  try{context.ledger=assetLedger((await readTrades()).filter(t=>normalizeAssetTrade(t).symbol===row.symbol));holding=card(`${row.name} ${row.symbol}・我的持有`,`<label><input type="checkbox" id="personal-holding-confirm" data-personal-context="${contextID}">已核對此證券交易與目前報價使用相同幣別，且配息、配股、拆股完整</label><div id="personal-holding-values">${holdingValues(context,false)}</div><p class="muted">FIFO 交易估算，買入含输入稅費；配股與拆股依增減股數攤平原成本。只讀既有交易，不改寫來源。</p>`);}catch(error){holding=status('持股紀錄無法讀取',error.message,'!',true);}
  try{
   context.original=localStorage.getItem(key);
   const saved=context.original===null?null:validatePersonalRecord(JSON.parse(context.original),row.symbol);
   return holding+card(`${row.name} ${row.symbol}・筆記與價格提醒`,`<p class="muted">個人紀錄保存在此瀏覽器，並納入新版完整備份。提醒依頁面目前報價判斷，關閉頁面後不持續監控，也不發送背景通知。</p><form id="personal-record-form" data-personal-context="${contextID}" class="stack"><label>筆記（最多10,000字）<textarea name="note" rows="7">${e(saved?.note||'')}</textarea></label><label><input type="checkbox" name="enabled" ${saved?.enabled?'checked':''}>啟用價格提醒</label><label>觸發條件<select name="direction"><option value="above" ${saved?.direction!=='below'?'selected':''}>市價大於或等於</option><option value="below" ${saved?.direction==='below'?'selected':''}>市價小於或等於</option></select></label><label>原始市場目標價<input name="target" type="text" inputmode="decimal" value="${saved?.target??''}"></label><button class="primary" ${saving?'disabled':''}>儲存筆記與提醒</button><p id="personal-record-feedback" role="status"></p><p id="personal-reminder-status" role="status">${e(reminderStatus(saved,row))}</p></form>`);
  }catch(error){return holding+status('個人紀錄無法讀取',error.message+'；原始資料保留，請從備份復原或重新載入。','!',true);}
 }
 function holdingValues(context,confirmed){
  const positionLedger=context.ledger,row=context.row,position=positionLedger?.positions[0],valid=positionLedger?.issues.length===0;
  const shares=valid?(position?.shares??0):null,basis=confirmed&&valid?(position?.basis??0):null;
  const value=confirmed&&valid&&row.eligible&&Number.isFinite(row.price)&&row.price>0?shares*row.price:null;
  const pnl=Number.isFinite(value)&&Number.isFinite(basis)?value-basis:null;
  return [['帳本持有股數',shares],['FIFO 剩餘成本（原交易幣別）',basis],['持股市值（報價幣別）',value],['未實現損益',pnl]].map(([label,value])=>`<div class="metric"><small>${label}</small><span>${number(Number.isFinite(value)?value:null)}</span></div>`).join('')+`<p class="muted">原始行情日期：${e(row.asOf||'資料日期不足')}</p>`+(positionLedger?.issues||[]).map(issue=>`<p role="status">${e(issue)}</p>`).join('');
 }
 host.addEventListener('change',event=>{if(event.target.id==='personal-holding-confirm'){const target=host.querySelector('#personal-holding-values');if(target)target.innerHTML=holdingValues(contexts.get(event.target.dataset.personalContext),event.target.checked);}});
 host.addEventListener('submit',async event=>{
  if(event.target.id!=='personal-record-form')return;event.preventDefault();if(saving)return;
  const form=event.target,context=contexts.get(form.dataset.personalContext),row=context.row,feedback=form.querySelector('#personal-record-feedback'),button=form.querySelector('button');
  saving=true;button.disabled=true;
  try{
   const fields=new FormData(form),raw=String(fields.get('target')).trim();
   const value=validatePersonalRecord({schemaVersion:1,symbol:row.symbol,name:row.name,note:String(fields.get('note')),enabled:fields.has('enabled'),direction:String(fields.get('direction')),target:raw===''?null:Number(raw),updatedAt:new Date().toISOString()},row.symbol);
   const result=await savePersonalRecord('rebuild.notes.v1.'+row.symbol,context.original,value);
   if(form.isConnected){context.original=result;feedback.textContent='已儲存筆記與提醒。';form.querySelector('#personal-reminder-status').textContent=reminderStatus(value,row);}
  }catch(error){if(form.isConnected)feedback.textContent=error.message+'；原始紀錄與恢復日誌保留。';}
  finally{saving=false;const currentButton=host.querySelector('#personal-record-form button');if(currentButton)currentButton.disabled=false;}
 });
 return {page};
}
