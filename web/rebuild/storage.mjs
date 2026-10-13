import {normalizeFavorites} from './core.mjs';
const legacyKeys=['twstock_favorite_categories','twstock_favorite_data'];
const legacyListKeys=['twstock_stock_list_columns_v1','twstock_stock_list_columns_v2'];
const favoritesKey='rebuild.watchlist.v1';
const lockName='TWStockTracker.rebuild.storage.v2';
const isPreference=k=>legacyKeys.includes(k)||k===favoritesKey||[
 'rebuild.appearance.v1','rebuild.workspace.v1','rebuild.scanner.v1',
 'rebuild.strategy.sort.v1','rebuild.strategy.columns.v1','rebuild.desktopOpen.v1',
 'rebuild.heatmap.sector.v1','rebuild.asset.cash.snapshot.v1',
 'rebuild.startupCompletionAcknowledged.v1','rebuild.watchlist.names.v1','rebuild.savedStrategies.v1','rebuild.activeStrategy.v1',
 'rebuild.migration.list-preferences.v1'
].includes(k)||[
 'rebuild.list.v1.','rebuild.notes.v1.','rebuild.columns.v1.','rebuild.panels.v1.'
].some(prefix=>k.startsWith(prefix))||legacyListKeys.includes(k);
const dangerous=new Set(['__proto__','prototype','constructor']);
export function canonicalJSON(value){
 if(value===null||typeof value==='string'||typeof value==='boolean')return JSON.stringify(value);
 if(typeof value==='number'){if(!Number.isFinite(value))throw Error('備份包含非有限數值');return JSON.stringify(value);}
 if(Array.isArray(value))return '['+value.map(canonicalJSON).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>{if(dangerous.has(k))throw Error('備份包含不支援的欄位名稱');return JSON.stringify(k)+':'+canonicalJSON(value[k]);}).join(',')+'}';
 throw Error('備份資料型別不支援');
}
async function digest(value){const bytes=new TextEncoder().encode(canonicalJSON(value));return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');}
function clone(value){return JSON.parse(canonicalJSON(value));}
function validateCategoryOrder(order,groups){
 const keys=Object.keys(groups);
 if(order===undefined)return keys;
 if(!Array.isArray(order)||!order.every(x=>typeof x==='string')||new Set(order).size!==order.length||order.length!==keys.length||order.some(x=>!Object.hasOwn(groups,x)))throw Error('備份自選分類順序與分類資料不一致');
 return order;
}
export function mergeFavoriteGroups(currentValue,incomingValue,incomingOrder){
 const current=validateGroups(currentValue),incoming=validateGroups(incomingValue),order=validateCategoryOrder(incomingOrder,incoming),result=Object.create(null);
 for(const key of [...Object.keys(current),...order])if(!Object.hasOwn(result,key))Object.defineProperty(result,key,{value:[...new Set([...(current[key]??[]),...(incoming[key]??[])])],enumerable:true,writable:true,configurable:true});
 return result;
}
export function openDatabase(name,version,upgrade){return new Promise((resolve,reject)=>{
 const req=version?indexedDB.open(name,version):indexedDB.open(name);let blocked=false;
 req.onupgradeneeded=e=>{if(blocked){req.transaction.abort();return;}upgrade?.(req.result,e.oldVersion,req.transaction);};
 req.onsuccess=()=>{if(blocked){req.result.close();return;}req.result.onversionchange=()=>req.result.close();resolve(req.result);};
 req.onerror=()=>reject(req.error);req.onblocked=()=>{blocked=true;reject(Error('其他分頁阻擋資料庫，請關閉其他分頁後重試'));};
});}
function transactionDone(tx){return new Promise((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error??Error('資料交易中斷'));tx.onerror=()=>{};});}
function requestValue(req){return new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
async function readTradesUnlocked(){
 if(typeof indexedDB.databases==='function'&&!(await indexedDB.databases()).some(d=>d.name==='TWStockTrackerDB'))return [];
 let missing=false,db;try{db=await openDatabase('TWStockTrackerDB',null,(_db,old,tx)=>{if(old===0){missing=true;tx.abort();}});}catch(error){if(missing&&error?.name==='AbortError')return [];throw error;}
 try{if(!db.objectStoreNames.contains('trades'))throw Error('既有資料庫沒有 trades，已保留原狀');const tx=db.transaction('trades','readonly'),done=transactionDone(tx);const rows=await requestValue(tx.objectStore('trades').getAll());await done;return rows;}finally{db.close();}
}
async function safetyDB(){return openDatabase('TWStockTrackerRebuildSafety',1,db=>db.createObjectStore('checkpoints',{keyPath:'hash'}));}
async function safetyPut(record){const db=await safetyDB();try{const tx=db.transaction('checkpoints','readwrite'),done=transactionDone(tx);tx.objectStore('checkpoints').put(record);await done;const check=await requestValue(db.transaction('checkpoints','readonly').objectStore('checkpoints').get(record.hash));if(canonicalJSON(check)!==canonicalJSON(record))throw Error('安全日誌讀回驗證失敗');}finally{db.close();}}
async function journals(){const db=await safetyDB();try{return (await requestValue(db.transaction('checkpoints','readonly').objectStore('checkpoints').getAll())).filter(r=>r.kind==='restore-v2'&&r.phase!=='COMPLETED');}finally{db.close();}}
async function locked(action){if(!globalThis.navigator?.locks?.request)throw Error('此瀏覽器無法提供跨分頁安全鎖；請使用支援 Web Locks 的瀏覽器進行寫入或還原');return navigator.locks.request(lockName,{mode:'exclusive'},action);}
function preferences(){return Object.fromEntries(Object.keys(localStorage).filter(isPreference).sort().map(k=>[k,localStorage.getItem(k)]));}
export function favorites(){const raw=localStorage.getItem(favoritesKey)??localStorage.getItem('twstock_favorite_data');return normalizeFavorites(raw?JSON.parse(raw):null);}
function validateGroups(value){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('自選分類格式不正確');
 for(const [key,rows] of Object.entries(value)){if(dangerous.has(key)||!Array.isArray(rows)||rows.some(x=>typeof x!=='string'||!x.trim()))throw Error('自選分類或證券代號格式不正確');}
 return normalizeFavorites(value);
}
export function normalizeLegacyFavoritesPayload(legacy,legacyCategories){
 let groups=legacy===null?Object.create(null):validateGroups(normalizeFavorites(JSON.parse(legacy)));
 if(legacyCategories!==null){
  const categories=JSON.parse(legacyCategories);
  if(!Array.isArray(categories)||!categories.every(x=>typeof x==='string'&&x.trim())||new Set(categories).size!==categories.length)throw Error('舊版分類名稱清單格式不正確');
  const ordered=Object.create(null);
  for(const category of categories)ordered[category]=Object.hasOwn(groups,category)?groups[category]:[];
  for(const [category,items] of Object.entries(groups))if(!Object.hasOwn(ordered,category))ordered[category]=items;
  groups=ordered;
 }
 return validateGroups(groups);
}
function identityKey(id){
 const value=typeof id==='string'&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id)?id.toLowerCase():id;
 return canonicalJSON([typeof id,value]);
}
function validateRows(rows){
 if(!Array.isArray(rows))throw Error('交易清單格式不正確');
 const seen=new Map();
 for(const row of rows){
  if(!row||typeof row!=='object'||Array.isArray(row))throw Error('交易資料格式不正確');canonicalJSON(row);
  if(row.id===undefined||row.id===null||!['string','number'].includes(typeof row.id)||(typeof row.id==='number'&&!Number.isFinite(row.id))||(typeof row.id==='string'&&!row.id))throw Error('交易缺少合法主鍵');
  const key=identityKey(row.id);if(seen.has(key))throw Error('備份含重複交易主鍵');seen.set(key,row);
 }
 return rows;
}
async function snapshotUnlocked(){
 const trades=await readTradesUnlocked();
 const savedFavorites=favorites();
 const body={version:2,platform:'web',createdAt:new Date().toISOString(),trades,favorites:savedFavorites,favoriteCategoryOrder:Object.keys(savedFavorites),preferences:preferences()};
 const hash=await digest(body),record={hash,createdAt:body.createdAt,kind:'backup-v2',payload:body};await safetyPut(record);
 return {hash,count:trades.length,trades:body.trades,preferences:body.preferences,backup:{...body,checksum:hash}};
}
// Read-only callers may inspect a partially recovered ledger, but UI startup must
// recoverStorage() before enabling any mutation or presenting restore success.
export async function readTrades(){return readTradesUnlocked();}
export async function preflight(){return locked(async()=>{await recoverUnlocked();return snapshotUnlocked();});}
/**
 * Switch the rebuilt Web reader to its namespaced favorites key only after a
 * checksummed snapshot exists. The original key is intentionally retained so
 * a rollback can still read the exact pre-migration value. A durable journal
 * makes the one-key cutover resumable after a tab or browser interruption.
 */
export async function migrateLegacyFavorites(){
 return locked(async()=>{
  await recoverUnlocked();
  const rebuilt=localStorage.getItem(favoritesKey);
  if(rebuilt!==null){
   try{validateGroups(JSON.parse(rebuilt));}
   catch(error){throw Error(`新版自選資料無法安全讀取；原有新舊資料均已保留，請匯出診斷後復原：${error.message}`);}
   return {migrated:false};
  }
  const legacy=localStorage.getItem('twstock_favorite_data');
  // Category labels and their order are a separate legacy source key. Even
  // though the rebuilt map stores labels as object keys, guard both inputs so
  // an older open tab cannot rename/reorder categories while the new key is
  // being switched from a stale snapshot.
  const legacyCategories=localStorage.getItem('twstock_favorite_categories');
  if(legacy===null&&legacyCategories===null)return {migrated:false};
  let groups;
  try{
   groups=normalizeLegacyFavoritesPayload(legacy,legacyCategories);
  }
  catch(error){throw Error(`舊版自選資料無法安全升級，原始資料已保留：${error.message}`);}
  const before=await snapshotUnlocked();
  const after=JSON.stringify(groups);
  const plan={rows:[],patches:[{key:favoritesKey,before:null,after}],guards:[{key:'twstock_favorite_data',value:legacy},{key:'twstock_favorite_categories',value:legacyCategories}],beforeHash:before.hash,kind:'legacy-favorites-v1-to-v2'};
  const op={hash:'migration:'+crypto.randomUUID(),kind:'restore-v2',phase:'PREPARED',createdAt:new Date().toISOString(),plan,planHash:await digest(plan),result:{added:0,skipped:0,beforeHash:before.hash,migration:'LEGACY_FAVORITES_TO_REBUILT_V1',legacyCategorySourceHash:await digest(legacyCategories)}};
  await safetyPut(op);
  try{await resume(op);}
  catch(error){throw Error(`自選資料切換尚未完成；來源與恢復日誌均已保留，重新啟動可接續：${error.message}`);}
  return {migrated:true,sourceCount:Object.values(groups).reduce((sum,items)=>sum+items.length,0)};
 });
}
export function exportBackup(checkpoint){if(checkpoint?.backup?.version!==2)throw Error('請重新建立完整備份快照');return clone(checkpoint.backup);}
export async function verifyBackup(payload){
 if(payload?.version!==2||payload.platform!=='web')throw Error('僅 v2 備份涵蓋完整 checksum；v1 可另行預覽，但不能完整還原，請從原裝置重新匯出');
 const {checksum,...body}=payload;if(typeof checksum!=='string'||await digest(body)!==checksum)throw Error('備份 checksum 不一致，未更動任何資料');
 validateRows(body.trades);validateGroups(body.favorites);const favoriteCategoryOrder=validateCategoryOrder(body.favoriteCategoryOrder,body.favorites);
 if(!body.preferences||typeof body.preferences!=='object'||Array.isArray(body.preferences)||Object.entries(body.preferences).some(([k,v])=>!isPreference(k)||(v!==null&&typeof v!=='string')))throw Error('備份偏好欄位不支援');
 if(typeof body.preferences['rebuild.savedStrategies.v1']==='string'){
  let strategies;try{strategies=JSON.parse(body.preferences['rebuild.savedStrategies.v1']);}catch{throw Error('備份本機策略 JSON 不合法');}
  if(!strategies||typeof strategies!=='object'||Array.isArray(strategies)||Object.entries(strategies).some(([id,item])=>['__proto__','prototype','constructor'].includes(id)||!item||typeof item!=='object'||item.id!==id||typeof item.name!=='string'||!item.buyCondition||!item.sellCondition))throw Error('備份本機策略定義格式不支援');
 }
 if(typeof body.preferences['rebuild.activeStrategy.v1']==='string'&&body.preferences['rebuild.activeStrategy.v1'].length>200)throw Error('備份啟用策略識別值不合法');
 if(typeof body.createdAt!=='string'||!Number.isFinite(Date.parse(body.createdAt)))throw Error('備份日期不正確');
 return {...clone(payload),favoriteCategoryOrder};
}
async function appendExact(rows){
 const db=await openDatabase('TWStockTrackerDB',null,(db,old)=>{if(old===0)db.createObjectStore('trades',{keyPath:'id',autoIncrement:true});});
 try{return await new Promise((resolve,reject)=>{
  const tx=db.transaction('trades','readwrite'),store=tx.objectStore('trades');let added=0,issue;
  if(store.keyPath!=='id'){issue=Error('既有交易主鍵格式不支援');tx.abort();}
  else for(const row of rows){const req=store.get(row.id);req.onsuccess=()=>{
   if(req.result===undefined){store.add(row);added++;}
   else if(canonicalJSON(req.result)!==canonicalJSON(row)){issue=Error(`交易主鍵 ${row.id} 內容衝突，原交易已保留`);tx.abort();}
  };}
  tx.oncomplete=()=>resolve(added);tx.onabort=()=>reject(issue??tx.error??Error('交易寫入中斷'));tx.onerror=()=>{};
 });}finally{db.close();}
}
async function validateJournal(op){
 const {plan,planHash}=op;if(await digest(plan)!==planHash)throw Error('還原日誌校驗失敗，禁止自動覆寫');
 validateRows(plan.rows);
 for(const patch of plan.patches){if(!isPreference(patch.key)||legacyKeys.includes(patch.key)||[patch.before,patch.after].some(v=>v!==null&&typeof v!=='string'))throw Error('還原日誌目的地不合法');}
 if(plan.guards!==undefined&&(!Array.isArray(plan.guards)||plan.guards.some(g=>!g||!legacyKeys.concat(legacyListKeys).includes(g.key)||typeof g.value!=='string')))throw Error('還原日誌來源條件不合法');
}
async function resume(op){
 await validateJournal(op);
 for(const guard of op.plan.guards??[])if(localStorage.getItem(guard.key)!==guard.value)throw Error('還原待恢復：舊版來源資料已被其他分頁修改，停止偏好切換');
 // Check all preferences before writing any. Old/non-cooperating tabs are not
 // locked by Web Locks; a changed value is a conflict, never an overwrite.
 for(const patch of op.plan.patches){const current=localStorage.getItem(patch.key);if(current!==patch.before&&current!==patch.after)throw Error('還原待恢復：偏好已被其他分頁修改，請保留資料並匯出診斷');}
 if(op.plan.rows.length)await appendExact(op.plan.rows);
 for(const patch of op.plan.patches){
  const current=localStorage.getItem(patch.key);if(current!==patch.before&&current!==patch.after)throw Error('還原待恢復：偏好在處理期間發生衝突');
  if(current!==patch.after){if(patch.after===null)localStorage.removeItem(patch.key);else localStorage.setItem(patch.key,patch.after);}
  if(localStorage.getItem(patch.key)!==patch.after)throw Error('還原待恢復：偏好寫入驗證失敗');
 }
 for(const guard of op.plan.guards??[])if(localStorage.getItem(guard.key)!==guard.value)throw Error('還原待恢復：舊版來源資料在切換期間發生變更');
 const live=new Map((await readTradesUnlocked()).map(t=>[canonicalJSON([typeof t.id,t.id]),t]));
 for(const row of op.plan.rows){if(canonicalJSON(live.get(canonicalJSON([typeof row.id,row.id]))??null)!==canonicalJSON(row))throw Error('還原待恢復：交易讀回驗證失敗');}
 op={...op,phase:'COMPLETED',completedAt:new Date().toISOString()};await safetyPut(op);return op.result;
}
async function recoverUnlocked(){const pending=await journals();for(const op of pending)await resume(op);return {recovered:pending.length};}
export async function recoverStorage(){return locked(recoverUnlocked);}
function validateStoredListPreference(key,raw){
 let value;try{value=JSON.parse(raw);}catch{throw Error(`清單偏好 ${key} 格式損毀；原始值保留，已停止啟動遷移`);}
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error(`清單偏好 ${key} 結構不正確；原始值保留，已停止啟動遷移`);
 if(Object.hasOwn(value,'version')&&(!Number.isInteger(value.version)||value.version<0))throw Error(`清單偏好 ${key} 版本欄位不正確；原始值保留，已停止啟動遷移`);
 for(const field of ['fields','visibleFields','fieldOrder'])if(Object.hasOwn(value,field)&&(!Array.isArray(value[field])||!value[field].every(x=>typeof x==='string')))throw Error(`清單偏好 ${key} 欄位結構不正確；原始值保留，已停止啟動遷移`);
 for(const field of ['sort','sortField'])if(Object.hasOwn(value,field)&&typeof value[field]!=='string')throw Error(`清單偏好 ${key} 排序欄位不正確；原始值保留，已停止啟動遷移`);
 for(const field of ['descending','sortDescending','manual'])if(Object.hasOwn(value,field)&&typeof value[field]!=='boolean')throw Error(`清單偏好 ${key} 狀態欄位不正確；原始值保留，已停止啟動遷移`);
}
export async function migrateLegacyListPreferences(migrations){
 if(!Array.isArray(migrations))throw Error('清單偏好遷移計畫不合法');
 return locked(async()=>{
  await recoverUnlocked();
  for(const key of Object.keys(localStorage).filter(k=>k.startsWith('rebuild.list.v1.'))){const raw=localStorage.getItem(key);if(raw===null)throw Error(`清單偏好 ${key} 在檢查期間消失，請重新啟動`);validateStoredListPreference(key,raw);}
  if(!migrations.length)return {migrated:false};
  const sourceKey=migrations[0]?.sourceKey,sourceValue=migrations[0]?.sourceValue;
  if(!legacyListKeys.includes(sourceKey)||typeof sourceValue!=='string'||localStorage.getItem(sourceKey)!==sourceValue)throw Error('舊版清單偏好來源已改變，原始資料保留；請重新啟動再試');
  if(migrations.some(x=>x.sourceKey!==sourceKey||x.sourceValue!==sourceValue||typeof x.key!=='string'||!x.key.startsWith('rebuild.list.v1.')||!isPreference(x.key)||typeof x.value!=='string'))throw Error('清單偏好遷移計畫不合法');
  const patches=[];
  for(const x of migrations){
   const before=localStorage.getItem(x.key);
   if(before!==null)continue;
   patches.push({key:x.key,before:null,after:x.value});
  }
  const sourceHash=await digest(sourceValue),markerKey='rebuild.migration.list-preferences.v1';
  const previous=localStorage.getItem(markerKey);
  const migratedKeys=patches.map(x=>x.key).sort();
  // Hash the exact serialized destination bytes before recording the migration receipt.
  const destinationSHA256={};for(const patch of patches)destinationSHA256[patch.key]=await digest(patch.after);
  if(previous!==null){
   let old;try{old=JSON.parse(previous);}catch{throw Error('清單偏好遷移收據格式錯誤，已停止自動修改');}
   if(old?.schemaVersion!==1||old.sourceKey!==sourceKey||typeof old.sourceSHA256!=='string'||!/^[a-f0-9]{64}$/.test(old.sourceSHA256)||!old.destinationSHA256||typeof old.destinationSHA256!=='object'||Array.isArray(old.destinationSHA256)||Object.entries(old.destinationSHA256).some(([key,hash])=>!key.startsWith('rebuild.list.v1.')||typeof hash!=='string'||!/^[a-f0-9]{64}$/.test(hash)))throw Error('清單偏好遷移收據版本不支援，已停止自動修改');
   if(old.sourceSHA256===sourceHash){
    // Current values may reflect later user edits; a valid receipt must never
    // make an otherwise legitimate preference change block application startup.
    return {migrated:false};
   }
  }
  const finalReceipt=JSON.stringify({schemaVersion:1,sourceKey,sourceSHA256:sourceHash,destinationKeys:migratedKeys,destinationSHA256,createdAt:new Date().toISOString()});
  patches.push({key:markerKey,before:previous,after:finalReceipt});
  patches.push({key:sourceKey,before:sourceValue,after:sourceValue});
  const before=await snapshotUnlocked(),plan={rows:[],patches,guards:[{key:sourceKey,value:sourceValue}],beforeHash:before.hash,kind:'legacy-list-preferences-v1-to-namespaced-v1'};
  const op={hash:'migration:'+crypto.randomUUID(),kind:'restore-v2',phase:'PREPARED',createdAt:new Date().toISOString(),plan,planHash:await digest(plan),result:{added:0,skipped:0,beforeHash:before.hash,migration:'LEGACY_LIST_PREFERENCES_TO_NAMESPACED_V1',sourceSHA256:sourceHash,destinationKeys:migratedKeys}};
  await safetyPut(op);
  try{await resume(op);}catch(error){throw Error(`清單偏好遷移尚未完成；原始偏好與恢復日誌均已保留，重新啟動可接續：${error.message}`);}
  return {migrated:migratedKeys.length>0,sourceSHA256:sourceHash,destinationKeys:migratedKeys};
 });
}
export async function storageDiagnostics(){return {version:2,pending:await journals()};}
export async function mergeBackup(payload){
 const verified=await verifyBackup(payload);
 return locked(async()=>{
  await recoverUnlocked();const before=await snapshotUnlocked();
  validateRows(before.trades);
  const seen=new Map(before.trades.map(t=>[identityKey(t.id),t])),fresh=[];
  for(const row of verified.trades){const key=identityKey(row.id),old=seen.get(key);if(old&&canonicalJSON(old)!==canonicalJSON(row))throw Error(`交易主鍵 ${row.id} 衝突，未變更資料`);if(!old)fresh.push(row);}
  const groups=mergeFavoriteGroups(favorites(),verified.favorites,verified.favoriteCategoryOrder);
  const patches=[{key:favoritesKey,before:localStorage.getItem(favoritesKey),after:JSON.stringify(groups)}];
  for(const [key,value] of Object.entries(verified.preferences)){
   if(key===favoritesKey||legacyKeys.includes(key)||value===null)continue;
   const prior=localStorage.getItem(key);
   if(key==='rebuild.savedStrategies.v1'&&prior!==null){
    let local,incoming;try{local=JSON.parse(prior);incoming=JSON.parse(value);}catch{throw Error('本機或匯入策略定義格式不合法，未變更資料');}
    if(!local||typeof local!=='object'||Array.isArray(local)||!incoming||typeof incoming!=='object'||Array.isArray(incoming))throw Error('策略定義格式不合法，未變更資料');
    const merged={...local};for(const [id,item] of Object.entries(incoming)){if(['__proto__','prototype','constructor'].includes(id)||item?.id!==id)throw Error('策略識別值不合法，未變更資料');if(Object.hasOwn(merged,id)&&canonicalJSON(merged[id])!==canonicalJSON(item))throw Error(`策略 ${id} 在兩端內容不同，未變更資料`);if(!Object.hasOwn(merged,id))Object.defineProperty(merged,id,{value:item,enumerable:true,writable:true,configurable:true});}
    const after=JSON.stringify(merged);if(after!==prior)patches.push({key,before:prior,after});continue;
   }
   if(prior!==null)continue;patches.push({key,before:null,after:value});
  }
  const plan={rows:fresh,patches,beforeHash:before.hash,backupHash:verified.checksum};
  const op={hash:'restore:'+crypto.randomUUID(),kind:'restore-v2',phase:'PREPARED',createdAt:new Date().toISOString(),plan,planHash:await digest(plan),result:{added:fresh.length,skipped:verified.trades.length-fresh.length,beforeHash:before.hash}};
  await safetyPut(op);
  try{return await resume(op);}catch(error){throw Error('還原尚未完整完成，資料與日誌已保留，請重試恢復。'+error.message);}
 });
}
export async function appendTrades(rows){
 // Assign stable IDs before journaling. Retries from a restore use their original IDs.
 const prepared=rows.map(row=>({...row,id:row.id??crypto.randomUUID()}));validateRows(prepared);
 return locked(async()=>{await recoverUnlocked();await snapshotUnlocked();return appendExact(prepared);});
}
export async function mutateFavorites(mutate){return locked(async()=>{
 await recoverUnlocked();const before=localStorage.getItem(favoritesKey),groups=favorites();const result=mutate(groups)??groups;validateGroups(result);
 if(localStorage.getItem(favoritesKey)!==before)throw Error('自選已被其他分頁修改，請重試');
 const bytes=JSON.stringify(result);localStorage.setItem(favoritesKey,bytes);if(localStorage.getItem(favoritesKey)!==bytes)throw Error('自選寫入未通過驗證');return result;
});}
// Compatibility API. Callers must await and should migrate read-modify-write
// operations to mutateFavorites(callback), so their reads occur inside the lock.
export async function saveFavorites(groups){return mutateFavorites(()=>groups);}

// Legacy v1 checksum protected trades/preferences, not favorites. Conversion is
// explicit and retains provenance; default import excludes unverified favorites.
export async function previewLegacyBackup(payload){
 if(payload?.version!==1||payload.platform!=='web'||typeof payload.checksum!=='string')throw Error('不是舊版 Web 備份');
 validateRows(payload.trades);
 if(!payload.preferences||typeof payload.preferences!=='object'||Array.isArray(payload.preferences)||Object.entries(payload.preferences).some(([k,v])=>!legacyKeys.includes(k)||(v!==null&&typeof v!=='string')))throw Error('舊版偏好格式不正確');
 const original={version:1,trades:payload.trades,preferences:payload.preferences};
 const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(original))))].map(x=>x.toString(16).padStart(2,'0')).join('');
 if(hash!==payload.checksum)throw Error('舊版交易 checksum 不一致，未更動資料');
 const groups=validateGroups(payload.favorites);
 return {version:1,tradeCount:payload.trades.length,favoriteCount:Object.values(groups).flat().length,integrity:'LEGACY_PARTIAL_CHECKSUM',warning:'舊版自選未受 checksum 保護。預設只匯入交易；自選需逐項核對後明確選擇納入。'};
}
export async function convertLegacyBackup(payload,{includeUnverifiedFavorites=false}={}){
 await previewLegacyBackup(payload);
 const importedFavorites=includeUnverifiedFavorites?clone(payload.favorites):{};
 const importedFavoriteOrder=includeUnverifiedFavorites?Object.keys(payload.favorites):[];
 const body={version:2,platform:'web',createdAt:new Date().toISOString(),trades:clone(payload.trades),favorites:importedFavorites,favoriteCategoryOrder:importedFavoriteOrder,preferences:{},sourceVersion:1,sourceIntegrity:'LEGACY_PARTIAL_CHECKSUM',unverifiedFavoritesIncluded:includeUnverifiedFavorites};
 return {...body,checksum:await digest(body)};
}

// Personal records share the recovery journal and full-backup preference contract.
export async function savePersonalRecord(key,expected,value){
 if(!/^rebuild\.notes\.v1\.[A-Za-z0-9._^-]+$/.test(key))throw Error('個人紀錄代號格式不正確');
 return locked(async()=>{
  await recoverUnlocked();
  if(localStorage.getItem(key)!==expected)throw Error('紀錄已由其他分頁更新，請重新讀取後再編輯');
  const before=await snapshotUnlocked(),after=JSON.stringify(value);
  const plan={rows:[],patches:[{key,before:expected,after}],beforeHash:before.hash};
  const op={hash:'restore:'+crypto.randomUUID(),kind:'restore-v2',phase:'PREPARED',createdAt:new Date().toISOString(),plan,planHash:await digest(plan),result:{added:0,skipped:0,beforeHash:before.hash}};
  await safetyPut(op);await resume(op);return after;
 });
}
