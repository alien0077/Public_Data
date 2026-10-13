// Local-only compatibility parsing. This module never writes user storage.
import {canonicalJSON} from './storage.mjs';
const MAX=25*1024*1024;
const bytesOf=text=>new TextEncoder().encode(text);
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const fail=message=>{throw Error(message);};
let pdfRuntime;
export async function loadLocalPDFRuntime(){
 if(!pdfRuntime)pdfRuntime=import('./vendor/pdfjs/build/pdf.mjs').then(runtime=>{runtime.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdfjs/build/pdf.worker.mjs',import.meta.url).href;return runtime;}).catch(error=>{pdfRuntime=null;throw error;});
 return pdfRuntime;
}
const types=new Set(['買入','賣出','配息','配股','拆股']);
function dateOf(value){
 let date;
 if(finite(value))date=new Date((value+978307200)*1000); // Swift JSONEncoder reference date 2001-01-01 UTC.
 else if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)){
  const day=value.slice(0,10);if(new Date(day+'T00:00:00Z').toISOString().slice(0,10)!==day)fail('ISO 日期不存在');date=new Date(value);
 }
 else fail('iOS 日期必須是 ISO 8601 或 Swift reference-date 秒數');
 if(!Number.isFinite(date.getTime()))fail('交易日期超出可表示範圍');
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
 const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));return `${p.year}-${p.month}-${p.day}`;
}
function transaction(row,index,names){
 if(!row||typeof row!=='object'||Array.isArray(row))fail(`第 ${index+1} 筆交易不是物件`);
 if(typeof row.id!=='string'||!/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(row.id))fail(`第 ${index+1} 筆交易缺少 iOS UUID`);
 if(typeof row.symbol!=='string'||!row.symbol.trim()||!types.has(row.type))fail(`第 ${index+1} 筆交易代號或類型不合法`);
 const {shares,price,fee,tax}=row;
 if(!Object.hasOwn(row,'fee')||!Object.hasOwn(row,'tax')||fee===null||tax===null)fail(`第 ${index+1} 筆交易缺少手續費或交易稅；不能以零補入，請先於來源核對`);
 if(![shares,price,fee,tax].every(finite)||price<0||fee<0||tax<0||(row.type==='拆股'?shares===0:shares<=0))fail(`第 ${index+1} 筆交易數值不合法`);
 if(['配息','配股','拆股'].includes(row.type)&&(price!==0||fee!==0||tax!==0))fail(`第 ${index+1} 筆企業行動欄位語意與 Web 不相容，不能自動轉換`);
 if(!Number.isFinite(shares*price+fee+tax))fail(`第 ${index+1} 筆交易金額溢位`);
 const symbol=row.symbol,name=typeof row.name==='string'&&row.name.trim()?row.name.trim():names?.[symbol]?.name??symbol;
 return {id:row.id,date:dateOf(row.date),type:row.type,shares,price,symbol,name,fee,tax,notes:typeof row.notes==='string'?row.notes:'',isManualValue:true,sourceIsManualValue:typeof row.isManualValue==='boolean'?row.isManualValue:null,sourceDate:row.date};
}
export async function previewIOSBackup(input,{filename='iOS backup',names={}}={}){
 const bytes=typeof input==='string'?bytesOf(input):new Uint8Array(input);if(bytes.byteLength>MAX)fail('備份超過 25 MB');
 const sourceHash=await hash(bytes);let value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)),integrity='來源沒有 checksum',format='iOS 舊備份';
 if(value?.platform==='web')fail('Web 備份請使用 Web 備份預覽');
 if(value?.platform==='ios'){
  if(value.version!==2||typeof value.payload!=='string'||typeof value.checksum!=='string'||!/^[a-f0-9]{64}$/.test(value.checksum))fail('不支援的 iOS 備份版本');
  const raw=Uint8Array.from(atob(value.payload),c=>c.charCodeAt(0));if(await hash(raw)!==value.checksum)fail('iOS payload checksum 不符');
  value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));integrity='iOS payload SHA-256 已核對';format='iOS v2';
 }
 const rows=Array.isArray(value)?value:value?.transactions;if(!Array.isArray(rows))fail('找不到 iOS transactions 清單');
 canonicalJSON(value);const trades=rows.map((r,i)=>transaction(r,i,{...names,...value.learnedStocks}));
 if(new Set(trades.map(r=>r.id.toLowerCase())).size!==trades.length)fail('來源包含重複 UUID，請先在原裝置核對');
 const watchlist=value.watchlist&&typeof value.watchlist==='object'&&!Array.isArray(value.watchlist)?value.watchlist:null;
 const sourceGroups=watchlist?.categories&&typeof watchlist.categories==='object'&&!Array.isArray(watchlist.categories)?watchlist.categories:{};
 const categoryNames=watchlist?.categoryNames&&typeof watchlist.categoryNames==='object'&&!Array.isArray(watchlist.categoryNames)?watchlist.categoryNames:{};
 const keys=Object.keys(sourceGroups);
 if(keys.some(k=>!k||['__proto__','constructor','prototype'].includes(k)||!Array.isArray(sourceGroups[k])||sourceGroups[k].some(s=>typeof s!=='string'||!s.trim())))fail('iOS 自選分類或成員格式不合法');
 if(Object.entries(categoryNames).some(([k,v])=>!keys.includes(k)||typeof v!=='string'))fail('iOS 自選分類名稱格式不合法');
 const order=value.favoriteCategoryOrder??keys;
 if(!Array.isArray(order)||new Set(order).size!==order.length||order.length!==keys.length||order.some(k=>!Object.hasOwn(sourceGroups,k)))fail('iOS 自選分類順序與內容不一致');
 const memberOrder=value.favoriteMemberOrder&&typeof value.favoriteMemberOrder==='object'&&!Array.isArray(value.favoriteMemberOrder)?value.favoriteMemberOrder:{};
 const favorites={};
 for(const key of order){const values=sourceGroups[key],saved=memberOrder[key]??values;if(!Array.isArray(saved)||new Set(saved).size!==saved.length||saved.length!==values.length||saved.some(s=>!values.includes(s)))fail(`iOS 自選成員順序不合法：${key}`);favorites[key]=saved;}
 const allowedPrefs=new Set(['rebuild.appearance.v1','rebuild.scanner.v1','rebuild.strategy.sort.v1','rebuild.strategy.columns.v1','rebuild.asset.cash.snapshot.v1','rebuild.startupCompletionAcknowledged.v1','rebuild.watchlist.names.v1','rebuild.savedStrategies.v1','rebuild.activeStrategy.v1']);
 const portable=value.portablePreferences&&typeof value.portablePreferences==='object'&&!Array.isArray(value.portablePreferences)?value.portablePreferences:{};
 const preferences={};
 for(const [key,raw] of Object.entries(portable)){
  if(typeof raw!=='string'||raw.length>1_000_000||!(allowedPrefs.has(key)||key.startsWith('rebuild.list.v1.')||key.startsWith('rebuild.notes.v1.')))fail('iOS 跨平台偏好欄位不合法');
  if(key==='rebuild.savedStrategies.v1'){let map;try{map=JSON.parse(raw);}catch{fail('iOS 本機策略偏好不是合法 JSON');}if(!map||typeof map!=='object'||Array.isArray(map)||Object.entries(map).some(([id,item])=>['__proto__','prototype','constructor'].includes(id)||!item||typeof item!=='object'||item.id!==id||typeof item.name!=='string'||!item.buyCondition||!item.sellCondition))fail('iOS 本機策略定義不完整');}
  if(key==='rebuild.activeStrategy.v1'&&raw.length>200)fail('iOS 啟用策略識別值格式不合法');
  preferences[key]=raw;
 }
 if(Object.keys(categoryNames).length)preferences['rebuild.watchlist.names.v1']=JSON.stringify(categoryNames);
 const warnings=[Object.keys(favorites).length?'已匯入 iOS 自選分類、成員順序與名稱。':'iOS 備份沒有自選分類。',Object.keys(preferences).length?'已匯入可共用的介面偏好；僅限新版明確支援的偏好鍵。':'來源沒有可共用的介面偏好。','原檔年度結算與 normalizedTrades 僅保留於原始 iOS 備份，不會冒充成 Web 已還原資料。','舊版匯出可能只含買賣；缺少股利不會自動補造。','日期轉成台北交易日；UUID 原值保留，重複主鍵仍由還原引擎檢查。'];
 return {kind:'ios',format:Array.isArray(value)?'iOS 交易 JSON':format,integrity,filename,sourceHash,trades,favorites,favoriteCategoryOrder:order,preferences,warnings};
}
export async function convertCompatiblePreview(preview,{selectedIDs=null}={}){
 if(!preview||!['ios','cooperative-pdf'].includes(preview.kind)||!Array.isArray(preview.trades))fail('匯入預覽不存在');
 const selected=selectedIDs===null?null:new Set(selectedIDs),trades=preview.trades.filter(r=>selected===null||selected.has(r.id));
 if(!trades.length&&(preview.kind==='cooperative-pdf'||!(Object.keys(preview.favorites??{}).length||Object.keys(preview.preferences??{}).length)))fail('未選擇可匯入交易或跨平台資料');
 const body={version:2,platform:'web',createdAt:new Date().toISOString(),trades,favorites:preview.favorites??{},favoriteCategoryOrder:preview.favoriteCategoryOrder??Object.keys(preview.favorites??{}),preferences:preview.preferences??{},sourceFormat:preview.format,sourceHash:preview.sourceHash,sourceIntegrity:preview.integrity};
 return {...body,checksum:await hash(bytesOf(canonicalJSON(body)))};
}

// Inject a locally hosted PDF.js runtime. No network request or OCR fallback.
export async function extractPDFText(file,{pdfjs,password='',onProgress=()=>{}}={}){
 pdfjs??=await loadLocalPDFRuntime();
 if(!pdfjs?.getDocument)fail('本機 PDF 文字引擎無法載入');
 if(file.size>MAX)fail('PDF 超過 25 MB');
 const bytes=new Uint8Array(await file.arrayBuffer()),sourceHash=await hash(bytes);
 if(new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-')fail('不是 PDF 檔案');
 const loading=pdfjs.getDocument({data:bytes,password,isEvalSupported:false,disableFontFace:true,useSystemFonts:false,useWasm:false,cMapUrl:new URL('./vendor/pdfjs/cmaps/',import.meta.url).href,cMapPacked:true,standardFontDataUrl:new URL('./vendor/pdfjs/standard_fonts/',import.meta.url).href});let doc;
 try{doc=await loading.promise;if(doc.numPages>300)fail('PDF 超過 300 頁');const pages=[];
  for(let pageNo=1;pageNo<=doc.numPages;pageNo++){
   const page=await doc.getPage(pageNo),content=await page.getTextContent();
   const items=content.items.filter(i=>typeof i.str==='string'&&i.str.trim()).map(i=>({text:i.str.trim(),x:i.transform[4],y:i.transform[5],width:i.width,height:Math.abs(i.height)||10}));
   if(items.some(i=>![i.x,i.y,i.width,i.height].every(finite)))fail('PDF 文字座標不合法');pages.push(items);page.cleanup();onProgress(pageNo/doc.numPages);
  }return {pages,sourceHash,filename:file.name};
 }finally{if(doc)await doc.destroy();else await loading.destroy();}
}
const aliases={date:['交易日期','成交日期','日期'],symbol:['證券代號','股票代號'],name:['證券名稱','股票名稱'],side:['買賣別','交易別'],shares:['股數','成交股數'],price:['成交單價','成交均價','單價','均價'],gross:['成交金額','成交價金'],fee:['手續費'],tax:['證交稅','交易稅'],net:['收付金額','應收付金額','淨收付金額']};
const compact=s=>s.replace(/\s+/g,'');
function rowsOf(items){
 const rows=[];for(const item of [...items].sort((a,b)=>b.y-a.y||a.x-b.x)){let row=rows.find(r=>Math.abs(r.y-item.y)<=Math.min(2,item.height*.2));if(!row){row={y:item.y,items:[]};rows.push(row);}row.items.push(item);}return rows.map(r=>r.items.sort((a,b)=>a.x-b.x));
}
function numberOf(text,label){const t=text.trim();if(!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(t))fail(`${label} 缺漏或不是明確數字`);const n=Number(t.replaceAll(',',''));if(!finite(n)||n>Number.MAX_SAFE_INTEGER)fail(`${label} 超出安全範圍`);return n;}
function pdfDay(text,year){const m=text.match(/^(?:(\d{3,4})[\/.年-])?(\d{1,2})[\/.月-](\d{1,2})日?$/);if(!m)fail('PDF 交易日期格式不支援');const y=m[1]?(+m[1]<1911?+m[1]+1911:+m[1]):year;if(!y)fail('PDF 未明示年份，不能推測');const day=`${y}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;if(new Date(day+'T00:00:00Z').toISOString().slice(0,10)!==day)fail('PDF 日期不合法');return day;}
export async function previewCooperativePDF(extracted,{names={}}={}){
 const all=extracted.pages.flat().map(i=>i.text).join(' ');if(!/合庫|合作金庫/.test(all))fail('非可辨識的合庫來源');
 const years=[...all.matchAll(/(?:民國\s*)?(\d{3,4})\s*年/g)].map(m=>+m[1]<1911?+m[1]+1911:+m[1]);const unique=[...new Set(years)],year=unique.length===1?unique[0]:null;
 const trades=[];let header=null,sequence=0;
 for(const page of extracted.pages){header=null;for(const row of rowsOf(page)){
  const found=[];for(const item of row){const key=Object.keys(aliases).find(k=>aliases[k].includes(compact(item.text)));if(key)found.push({key,x:item.x});}
  if(found.some(c=>c.key==='date')&&found.some(c=>c.key==='shares')){if(Object.keys(aliases).some(k=>!found.some(c=>c.key===k)))fail('合庫表頭缺少必要欄位：日期、代號、名稱、買賣別、股數、單價、價金、費、稅、淨額皆須明示');header=found.sort((a,b)=>a.x-b.x);continue;}
  const text=row.map(i=>i.text).join(' ');if(!/買進|買入|賣出/.test(text))continue;if(!header)fail('交易列缺少同頁明確欄位表頭，不能猜欄位');
  const cells={};for(const item of row){let column=header[0];for(const c of header)if(item.x>=c.x-2)column=c;cells[column.key]=(cells[column.key]??'')+item.text;}
  const side=compact(cells.side??'');if(!['買進','買入','賣出'].includes(side))fail('買賣別不明確');
  const symbol=compact(cells.symbol??'');if(!/^[A-Za-z0-9]{4,8}$/.test(symbol))fail('PDF 代號不明確，不以股票名稱反查猜測');
  const shares=numberOf(cells.shares??'','股數'),price=numberOf(cells.price??'','成交單價'),gross=numberOf(cells.gross??'','成交金額'),fee=numberOf(cells.fee??'','手續費'),tax=numberOf(cells.tax??'','證交稅'),net=numberOf((cells.net??'').replace(/^[+-]/,''),'淨額');
  if(!Number.isSafeInteger(shares)||shares<=0||price<=0)fail('PDF 股數或單價不合法');
  if(!finite(shares*price)||Math.abs(shares*price-gross)>1)fail('PDF 單價 × 股數與價金不符，請人工核對');
  const expected=side==='賣出'?gross-fee-tax:gross+fee+tax;if(!finite(expected)||Math.abs(expected-net)>1)fail('PDF 收付款與價金、費、稅不符，請人工核對');
  const id=await hash(bytesOf(`${extracted.sourceHash}:${sequence++}`));
  trades.push({id:`${id.slice(0,8)}-${id.slice(8,12)}-${id.slice(12,16)}-${id.slice(16,20)}-${id.slice(20,32)}`,date:pdfDay(compact(cells.date??''),year),type:side==='賣出'?'賣出':'買入',symbol,name:cells.name?.trim()||names[symbol]?.name||symbol,shares,price,fee,tax,isManualValue:true,notes:`合庫 PDF SHA256 ${extracted.sourceHash}`});
 }}
 if(!trades.length)fail('沒有符合明確欄位格式的交易；掃描影像或其他版型不支援');
 return {kind:'cooperative-pdf',format:'合庫 PDF 明確欄位表',integrity:'來源檔案 SHA-256；數值交叉核對通過',filename:extracted.filename,sourceHash:extracted.sourceHash,trades,warnings:['僅支援文字 PDF 且每頁有完整單列表頭；不推測年份、代號或缺少稅費。','同一檔案重匯 ID 相同；不同檔案包含相同交易仍需人工排除。請逐筆核對後才合併。']};
}
