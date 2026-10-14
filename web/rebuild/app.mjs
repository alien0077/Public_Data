import {createPersonalRecords} from './personal-records.mjs';
import {fundDisclosure,fundSnapshotDate,quarterlyFundHoldingsPanel} from './etf.mjs';
import {mountComparison} from './comparison.mjs';
import {mountWorkspaceKeys,markWorkspaceSelection} from './workspace-keys.mjs';
import {mountPanelLayout} from './panel-layout.mjs';
import {columnWidth,columnHandle,mountColumnWidths} from './column-widths.mjs';
import {researchPanel} from './research-panel.mjs';
import {marketOverview} from './market.mjs';
import {workspaceControls,mountWorkspace} from './desktop.mjs';
import {cashflowRecords} from './cashflow.mjs';
import {mountHeatmap} from './heatmap.mjs';
import {mountChart} from './chart.mjs';
import {featureModules} from './features.mjs';
import {number,escapeHTML as e,taipeiDay,resolveListingStatus,identity,rawRow,withPriceReference,limitStatus,defaultPreference,normalizePreference,sortRows,readChart} from './core.mjs';
import {preflight,favorites,mutateFavorites,recoverStorage,migrateLegacyFavorites,migrateLegacyListPreferences,exportBackup} from './storage.mjs';
const app=document.querySelector('#app');
const personalRecords=createPersonalRecords(app,{card,status});
mountColumnWidths(app);
mountWorkspaceKeys(app,inspect);
const state={contract:null,listing:null,index:null,rows:[],indices:[],checkpoint:null,error:null,offline:false,loaded:false,group:'all',query:'',inspector:null,chartCount:60,showStartupCompletion:false};
const symbols={market:'▥',watchlist:'★',explore:'◉',assets:'◔',more:'•••'};
const cache=new Map(),scrolls=new Map();let generation=0,lastHash='',heatmapCleanup=null,routeLoading=false;
const routeStates=new Map();
if('scrollRestoration' in history)history.scrollRestoration='manual';
function saveRouteState(){if(!lastHash||routeLoading)return;scrolls.set(lastHash,window.scrollY);routeStates.set(lastHash,{query:state.query,group:state.group,inspector:state.inspector});}
function field(id){return state.contract.fields.find(f=>f.id===id)??{id,title:id};}
function format(row,id){const value=row[id];if(id==='sector')return e(value||'資料不足');if(value==null)return'資料不足';if(id==='weight'&&row.weightIsDelta)return `${number(value)} pp`;if(['changePercent','weight','yield'].includes(id))return`${value>0&&id==='changePercent'?'+':''}${number(value)}%`;return number(value,['volume','shares','marketCap'].includes(id)?0:2);}
function stockSummary(row){
 const percent=row.changePercent;
 const movement=Number.isFinite(percent)?percent===0?'平盤':`${percent>0?'上漲':'下跌'}百分之${number(Math.abs(percent))}`:'漲跌幅資料不足';
 return `${row.name||row.symbol} ${row.symbol}，${row.securityType==='fund'?'ETF':'股票'}，現價 ${number(row.price)}，${movement}，資料日期 ${row.asOf||'尚未載入'}`;
}
function movement(value){return value>0?'up':value<0?'down':'';}
function legacyListPreference(context){
 const page={watchlist:'favorites',holdings:'portfolio',institutional:'institutional','quick-filter':'rapid_screen','sector-pe':'sector_pe',quant:'quant',hot:'hottest'}[context];
 if(!page)return null;
 try{
  const raw=localStorage.getItem('twstock_stock_list_columns_v2')||localStorage.getItem('twstock_stock_list_columns_v1');
  if(!raw)return null;
  const saved=JSON.parse(raw)?.[page];if(!Array.isArray(saved)||!saved.every(x=>typeof x==='string'))return null;
  const map={cost_shares:['shares','cost'],current_change:['price','changePercent'],profit_return:['pnl'],sector:['sector'],start_days:['trackingDays'],accumulated_buy:['institutionalNet'],institutional_flow:['institutionalNet'],buy_days:['buyDays'],pe:['pe'],eps:['eps'],score_return:['score']};
  const fields=[...new Set(saved.flatMap(column=>map[column]??[]))];
  const defaults={watchlist:['changePercent',true],holdings:['shares',true],institutional:['institutionalNet',true],'quick-filter':['institutionalNet',true],'sector-pe':['pe',false],quant:['score',true],hot:['volume',true]}[context];
  return fields.length?{version:1,fields,sort:defaults[0],descending:defaults[1]}:null;
 }catch{return null;}
}
function pref(context){
  let v,raw,stored=false;
  try{raw=localStorage.getItem(`rebuild.list.v1.${context}`);if(raw!==null){v=JSON.parse(raw);stored=true;}}catch{}
  if(!v&&!stored)v=legacyListPreference(context);
  if(!v&&['institutional','quick-filter'].includes(context))v={version:1,fields:context==='institutional'?['price','institutionalNet','trackingDays']:['price','institutionalNet','buyDays'],sort:'institutionalNet',descending:true};
  if(!v&&context.startsWith('rebalance.'))v={version:1,fields:['weight'],sort:'weight',descending:true};
  if(!v&&context==='sector-pe')v={version:1,fields:['pe','eps','price'],sort:'pe',descending:false};
  if(!v&&context.startsWith('desktop.market.')){const sort=context.split('.').at(-1);v={version:1,fields:[...new Set(['price',sort,'volume','turnover'])],sort,descending:true};}
  if(!v&&context==='overview.turnover')v={version:1,fields:['price','turnover'],sort:'turnover',descending:true};
  if(!v&&context==='overview.volume')v={version:1,fields:['price','volume'],sort:'volume',descending:true};
  if(!v&&context==='hot')v={version:1,fields:['price','volume','turnover'],sort:'volume',descending:true};
  if(!v&&context==='quant')v={version:1,fields:['price','score','weight'],sort:'score',descending:true};
  if(!v&&context==='holdings')v={version:1,fields:['price','shares','cost','pnl'],sort:'shares',descending:true};
  if(!v&&context.startsWith('constituents.'))v={version:1,fields:['weight','price','changePercent'],sort:'weight',descending:true};
  const normalized=normalizePreference(v,state.contract.fields.map(f=>f.id));
  if(context!=='watchlist')normalized.manual=false;
  if(stored&&v&&typeof v==='object'&&!Array.isArray(v)&&(!Number.isInteger(v.version)||v.version>=0&&v.version<=1)&&JSON.stringify(v)!==JSON.stringify(normalized))savePref(context,normalized);
  return normalized;
}
function savePref(context,value){localStorage.setItem(`rebuild.list.v1.${context}`,JSON.stringify(value));}
function legacyListPreferenceMigrations(){
 const sourceKey=['twstock_stock_list_columns_v2','twstock_stock_list_columns_v1'].find(key=>localStorage.getItem(key)!==null);
 if(!sourceKey)return [];
 const sourceValue=localStorage.getItem(sourceKey),contexts=['watchlist','holdings','institutional','quick-filter','sector-pe','quant','hot'],fields=state.contract.fields.map(f=>f.id);
 let payload;try{payload=JSON.parse(sourceValue);}catch{throw Error('舊版清單偏好 JSON 損毀；原始資料保留，已停止自動遷移');}
 if(!payload||typeof payload!=='object'||Array.isArray(payload))throw Error('舊版清單偏好結構不正確；原始資料保留，已停止自動遷移');
 const pages=['favorites','portfolio','institutional','rapid_screen','sector_pe','quant','hottest'];
 for(const page of pages)if(Object.hasOwn(payload,page)&&(!Array.isArray(payload[page])||!payload[page].every(x=>typeof x==='string')))throw Error(`舊版清單偏好 ${page} 結構不正確；原始資料保留，已停止自動遷移`);
 return contexts.flatMap(context=>{
  const key=`rebuild.list.v1.${context}`;
  if(localStorage.getItem(key)!==null)return [];
  const legacy=legacyListPreference(context);if(!legacy)return [];
  const normalized=normalizePreference(legacy,fields);if(context!=='watchlist')normalized.manual=false;
  return [{sourceKey,sourceValue,key,value:JSON.stringify(normalized)}];
 });
}
function navigate(id,symbol){if(symbol&&['security','etf'].includes(id))state.inspector=symbol;saveRouteState();location.hash=`/${id}${symbol?'?symbol='+encodeURIComponent(symbol):''}`;}
function route(){const [name,query='']=(location.hash.slice(1)||'/launch').split('?');return{id:name.replace(/^\//,''),symbol:new URLSearchParams(query).get('symbol')};}
function title(id){return state.contract?.routes.find(r=>r.id===id)?.title??id;}
function link(id,label=title(id),symbol){return`<a class="directory-link" href="#/${e(id)}${symbol?'?symbol='+encodeURIComponent(symbol):''}"><span>${e(label)}</span><span aria-hidden="true">›</span></a>`;}
function card(name,body){return`<section class="card">${name?`<h2>${e(name)}</h2>`:''}${body}</section>`;}
function metric(name,value,css=''){return`<div class="metric"><small>${e(name)}</small><span class="value ${css}">${value}</span></div>`;}
function status(name,message,icon='▤',retry=false){return`<section class="card state" role="status"><span class="state-icon" aria-hidden="true">${icon}</span><h2>${e(name)}</h2><p class="muted">${e(message)}</p>${retry?'<button data-action="reload">重試</button>':''}</section>`;}
function unfinished(id){return status(`${title(id)}尚未接通`,'此功能仍在重建與資料比對階段，尚未開放操作。','◇');}
async function json(url){
 const absolute=new URL(url,location.href).href;
 const memory=cache.get(absolute);if(memory&&memory.expiresAt>Date.now())return memory.data;
 const ttl=absolute.endsWith('/index-intraday.json')||absolute.endsWith('/listing-eligibility.json')?60000:300000;
 try {const response=await fetch(absolute,{cache:'no-cache',signal:AbortSignal.timeout(20000)});if(!response.ok)throw new Error(`資料讀取失敗（${response.status}）`);let data;
  if(absolute.endsWith('.json.gz')){
   const bytes=new Uint8Array(await response.arrayBuffer());
   if(bytes[0]===0x1f&&bytes[1]===0x8b){
    if(typeof DecompressionStream!=='function')throw new Error('此瀏覽器不支援 gzip 估值明細；請更新 Safari 或改用 iOS App。');
    const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    data=await new Response(stream).json();
   }else data=JSON.parse(new TextDecoder().decode(bytes));
  }else data=await response.json();
  cache.set(absolute,{data,expiresAt:Date.now()+ttl});if('caches'in window){try{const c=await caches.open('twstock-rebuild-v1');await c.put(absolute,new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}}));}catch{}}return data;}
 catch(error){if('caches'in window){const saved=await caches.match(absolute);if(saved){const data=await saved.json();state.offline=true;state.error='來源連線失敗，顯示快取與原始資料日期。上市狀態仍依今日有效期驗證。';cache.set(absolute,{data,expiresAt:Date.now()+15000});return data;}}throw error;}
}
const byteCache=new Map();
async function publicBytes(path){
 const absolute=new URL(`../../data/${path}`,location.href).href;
 if(byteCache.has(absolute))return byteCache.get(absolute);
 const pending=(async()=>{
  let response;
  try{
   response=await fetch(absolute,{cache:'no-cache',signal:AbortSignal.timeout(20000)});
   if(!response.ok)throw new Error(`原始來源讀取失敗（${response.status}）`);
   if('caches'in window){try{const c=await caches.open('twstock-rebuild-v1');await c.put(absolute,response.clone());}catch{}}
  }catch(error){
   if('caches'in window){const saved=await caches.match(absolute);if(saved)response=saved;else throw error;}
   else throw error;
  }
  return new Uint8Array(await response.arrayBuffer());
 })();
 byteCache.set(absolute,pending);
 try{return await pending;}catch(error){byteCache.delete(absolute);throw error;}
}
async function publicData(path){return json(new URL(`../../data/${path}`,location.href).href);}
async function loadMarket(){
  state.index=await publicData('index.json');
  const [metadata,daily,indices]=await Promise.all([publicData('meta/stocks.json'),publicData(`daily/tw/${state.index.latest_daily_tw}.json`),publicData(`daily/tw_indices/${state.index.latest_daily_tw_indices}.json`)]);
  let references=null;
  try{references=await publicData('rebuild/price-references.json');if(references.schemaVersion!==1||references.basis!=='official_raw_close_minus_signed_change'||references.date!==state.index.latest_daily_tw||references.cutoff!==taipeiDay())state.error='官方價差尚未與行情同步，不匹配的漲跌幅顯示資料不足。';}
  catch{state.error='官方價差暫不可用；原始收盤價仍可查看。';}
  const byID=new Map((metadata.stocks??[]).map(x=>[x.symbol,x]));
  state.rows=(daily.stocks??[]).filter(r=>resolveListingStatus(r.id,taipeiDay(),state.listing).eligible).map(r=>rawRow(withPriceReference(r,references,daily.date??state.index.latest_daily_tw),byID.get(r.id),state.listing.stocks[r.id],daily.date??state.index.latest_daily_tw));
  state.indices=(indices.stocks??[]).map(r=>({...rawRow(r,{},null,state.index.latest_daily_tw_indices),name:{IX0001:'加權指數',IX0043:'櫃買指數'}[r.id]??r.id}));
  state.loaded=true;if(!state.rows.length&&state.listing?.cutoff!==taipeiDay())state.error='上市狀態憑證已過期，現行清單暫停顯示；請同步今日驗證資料。';
}
function rowList(rows,context){
  const p=pref(context),sorted=sortRows(rows,p).map(row=>{
    const symbol=String(row?.symbol??row?.stock_id??'').trim()||'資料不足';
    const quote=state.rows.find(item=>item.symbol===symbol);
    return {...row,...identity(symbol,row,quote,state.listing?.stocks?.[symbol])};
  }),saved=new Set(Object.values(favorites()).flat());
  const toolbar=`<div class="list-head"><small>${rows.length} 檔</small><select aria-label="排序欄位" data-sort="${e(context)}">${context==='watchlist'?`<option value="manual" ${p.manual?'selected':''}>分類順序</option>`:''}${state.contract.fields.map(f=>`<option value="${f.id}" ${!p.manual&&p.sort===f.id?'selected':''}>${e(f.title)}</option>`).join('')}</select><button data-action="reverse" data-context="${e(context)}" aria-label="切換排序方向" ${p.manual?'disabled':''}>${p.descending?'↓':'↑'}</button><button data-action="fields" data-context="${e(context)}" aria-label="欄位增減與排序">☷</button></div>`;
  if(!rows.length)return`<section class="stock-section stack">${toolbar}${status('尚無股票資料','加入自選或調整搜尋條件；資料載入後會顯示在這裡。')}</section>`;
  const cards=sorted.map(r=>`<article class="row"><a class="row-link" data-stock="${e(r.symbol)}" href="#/${securityTarget(r.symbol)}?symbol=${encodeURIComponent(r.symbol)}" aria-label="${e(stockSummary(r))}，開啟詳情"><div class="identity"><strong>${e(r.name)}</strong><span>${e(r.symbol)}</span></div><div class="row-fields">${p.fields.map(f=>`<div><small>${e(field(f).title)}</small><span class="value ${f==='changePercent'?movement(r.changePercent):''}">${format(r,f)}</span></div>`).join('')}</div></a><button class="star" data-action="favorite" data-symbol="${e(r.symbol)}" aria-label="${saved.has(r.symbol)?'從所有自選分類移除':'加入預設自選分類'} ${e(r.name)} ${e(r.symbol)}" aria-pressed="${saved.has(r.symbol)}">${saved.has(r.symbol)?'★':'☆'}</button></article>`).join('');
  const columns=['identity',...p.fields];
  const table=`<div class="stock-table"><div class="toolbar"><button data-column-reset="${e(context)}">重設欄寬</button><small data-width-status role="status">拖曳欄位邊界或使用方向鍵調整寬度。</small></div><table data-width-context="${e(context)}" style="table-layout:fixed;width:${columns.reduce((sum,f)=>sum+columnWidth(context,f),72)}px"><colgroup>${columns.map(f=>`<col data-width-field="${e(f)}" style="width:${columnWidth(context,f)}px">`).join('')}<col style="width:72px"></colgroup><thead><tr><th scope="col">名稱／代號${columnHandle(context,'identity','名稱／代號')}</th>${p.fields.map(f=>`<th scope="col" aria-sort="${!p.manual&&p.sort===f?(p.descending?'descending':'ascending'):'none'}" draggable="true" data-drag-field="${e(f)}" data-context="${e(context)}"><button data-action="sort-field" data-field="${e(f)}" data-context="${e(context)}">${e(field(f).title)}</button>${columnHandle(context,f,field(f).title)}</th>`).join('')}<th>自選</th></tr></thead><tbody>${sorted.map(r=>`<tr tabindex="0" data-row-stock="${e(r.symbol)}" aria-label="${e(stockSummary(r))}；Enter 開啟完整詳情，空白鍵依偏好開啟"><td><a data-stock="${e(r.symbol)}" href="#/${securityTarget(r.symbol)}?symbol=${encodeURIComponent(r.symbol)}"><strong>${e(r.name)}</strong><br><small>${e(r.symbol)}</small></a></td>${p.fields.map(f=>`<td class="${f==='changePercent'?movement(r.changePercent):''}" data-select-stock="${e(r.symbol)}">${format(r,f)}</td>`).join('')}<td><button class="star" data-action="favorite" data-symbol="${e(r.symbol)}" aria-label="${saved.has(r.symbol)?'從所有自選分類移除':'加入預設自選分類'} ${e(r.name)} ${e(r.symbol)}" aria-pressed="${saved.has(r.symbol)}">${saved.has(r.symbol)?'★':'☆'}</button></td></tr>`).join('')}</tbody></table></div>`;
  return`<section class="stock-section stack">${toolbar}<div class="rows">${cards}</div>${table}</section>`;
}
function chooseRows(){const all=favorites(),symbols=[...new Set(state.group==='all'?Object.values(all).flat():(all[state.group]??[]))],rows=new Map(state.rows.map(r=>[r.symbol,r]));return symbols.map(symbol=>rows.get(symbol)).filter(Boolean);}
function groupLabel(key){let names={};try{const raw=localStorage.getItem('rebuild.watchlist.names.v1');if(raw){const parsed=JSON.parse(raw);if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))names=parsed;}}catch{}return typeof names[key]==='string'&&names[key].trim()?names[key]:key==='cat1'?'我的最愛':key;}
function groupsPage(){const entries=Object.entries(favorites());return card('自選分類管理',`<p class="muted">點選分類管理成員；使用上下按鈕調整分類順序。原始自選資料保留，新版偏好另存。</p>${entries.map(([key,items],i)=>`<div class="toolbar group-management-row"><button class="grow" data-action="group-members" data-group="${e(key)}">${e(groupLabel(key))}　${items.length} 檔 ›</button><button data-action="group-up" data-group="${e(key)}" aria-label="${e(groupLabel(key))} 分類上移" ${i===0?'disabled':''}>↑</button><button data-action="group-down" data-group="${e(key)}" aria-label="${e(groupLabel(key))} 分類下移" ${i===entries.length-1?'disabled':''}>↓</button></div>`).join('')}<form id="add-group" class="stack"><label>新增分類<input name="name" required maxlength="80" placeholder="例如：觀察中"></label><button class="primary">＋ 新增分類</button></form>`);}
function groupMembers(key){const groups=favorites(),items=groups[key]??[];return `<div class="toolbar"><h2 class="grow">${e(groupLabel(key))} · 成員管理</h2><button data-action="close-fields">完成</button></div><p class="muted">調整順序、移至另一分類，或從此分類移除。股票行情仍可由搜尋開啟。</p><div class="stack">${items.map((symbol,i)=>{const row=state.rows.find(r=>r.symbol===symbol)??identity(symbol,state.listing?.stocks?.[symbol]);return `<section class="card"><a href="#/${securityTarget(symbol)}?symbol=${encodeURIComponent(symbol)}">${e(row.name)} ${e(symbol)}</a><div class="toolbar"><button data-action="member-up" data-group="${e(key)}" data-symbol="${e(symbol)}" aria-label="${e(row.name)} ${e(symbol)} 上移" ${i===0?'disabled':''}>↑</button><button data-action="member-down" data-group="${e(key)}" data-symbol="${e(symbol)}" aria-label="${e(row.name)} ${e(symbol)} 下移" ${i===items.length-1?'disabled':''}>↓</button><button data-action="member-remove" data-group="${e(key)}" data-symbol="${e(symbol)}">移除此成員</button></div><label>移至分類<select data-member-move="${e(symbol)}" data-group="${e(key)}"><option value="">選擇目的分類</option>${Object.keys(groups).filter(x=>x!==key).map(x=>`<option value="${e(x)}">${e(groupLabel(x))}</option>`).join('')}</select></label></section>`;}).join('')||'<p class="muted">此分類尚無成員。</p>'}</div><form id="group-add-member" data-group="${e(key)}" class="stack"><label>加入股票代號<input name="symbol" required list="group-securities"><datalist id="group-securities">${state.rows.map(r=>`<option value="${e(r.symbol)}">${e(r.name)}</option>`).join('')}</datalist></label><button class="primary">加入此分類</button><p role="status"></p></form>`;}
function openGroup(key){document.querySelector('dialog')?.remove();const d=document.createElement('dialog');d.dataset.group=key;d.innerHTML=groupMembers(key);app.append(d);d.showModal();}
function fieldsEditor(context,inline=false){const p=pref(context);return`<div class="stack"><div class="toolbar"><h2 class="grow">欄位設定</h2>${inline?'':'<button data-action="close-fields">完成</button>'}</div><p class="muted">名稱與代號固定顯示；拖拉欄位或使用上移／下移。</p><div>${p.fields.map((f,i)=>`<div class="editor-row" draggable="true" data-drag-field="${e(f)}" data-context="${e(context)}"><span>${e(field(f).title)}</span><button data-action="move-field" data-context="${e(context)}" data-field="${e(f)}" data-offset="-1" aria-label="上移${e(field(f).title)}" ${i===0?'disabled':''}>↑</button><button data-action="move-field" data-context="${e(context)}" data-field="${e(f)}" data-offset="1" aria-label="下移${e(field(f).title)}" ${i===p.fields.length-1?'disabled':''}>↓</button><button class="visibility" data-action="hide-field" data-context="${e(context)}" data-field="${e(f)}" aria-label="隱藏${e(field(f).title)}">−</button></div>`).join('')}</div><h3>新增欄位</h3><div class="toolbar">${state.contract.fields.filter(f=>!p.fields.includes(f.id)).map(f=>`<button data-action="add-field" data-context="${e(context)}" data-field="${e(f.id)}">＋ ${e(f.title)}</button>`).join('')}</div><button data-action="reset-fields" data-context="${e(context)}">還原預設欄位</button></div>`;}
function openFields(context){document.querySelector('dialog')?.remove();const d=document.createElement('dialog');d.dataset.context=context;d.innerHTML=fieldsEditor(context);app.append(d);d.showModal();}
function chart(points,row){
  if(!points.length)return status('尚無歷史行情','請先同步歷史行情。','↗');
  const visible=points.slice(-state.chartCount),lo=Math.min(...visible.map(x=>x.low)),hi=Math.max(...visible.map(x=>x.high)),span=hi-lo||1,w=760,h=250,pad=35;
  const y=v=>pad+(hi-v)/span*(h-pad*2),x=i=>pad+i*(w-pad*2)/Math.max(visible.length-1,1),bw=Math.max(1,Math.min(10,(w-pad*2)/visible.length*.65));
  const maxV=Math.max(...visible.map(x=>x.volume??0),1);
  const candles=visible.map((p,i)=>`<g class="${movement(p.close-p.open)}"><title>${e(row.name)} ${e(row.symbol)} ${new Date(p.time*1000).toISOString().slice(0,10)} 原始 OHLC ${p.open}/${p.high}/${p.low}/${p.close}</title><line x1="${x(i)}" x2="${x(i)}" y1="${y(p.high)}" y2="${y(p.low)}" stroke="currentColor"/><rect x="${x(i)-bw/2}" y="${Math.min(y(p.open),y(p.close))}" width="${bw}" height="${Math.max(Math.abs(y(p.open)-y(p.close)),1)}" fill="currentColor"/><rect x="${x(i)-bw/2}" y="${310-(p.volume??0)/maxV*50}" width="${bw}" height="${(p.volume??0)/maxV*50}" fill="currentColor"/></g>`).join('');
  return card(`${row.name} ${row.symbol}・原始 K 線`,`<div class="toolbar"><label>期間<select id="chart-period"><option value="20" ${state.chartCount===20?'selected':''}>1 月</option><option value="60" ${state.chartCount===60?'selected':''}>3 月</option><option value="120" ${state.chartCount===120?'selected':''}>6 月</option><option value="250" ${state.chartCount===250?'selected':''}>1 年</option></select></label><button data-action="chart-zoom" data-offset="-20" aria-label="放大圖表">＋</button><button data-action="chart-zoom" data-offset="20" aria-label="縮小圖表">−</button></div><svg class="chart" viewBox="0 0 760 345" role="img" aria-label="${e(row.name)} ${e(row.symbol)} 原始日K與獨立成交量，共${visible.length}筆"><line class="grid" x1="35" x2="725" y1="35" y2="35"/><line class="grid" x1="35" x2="725" y1="215" y2="215"/><text x="35" y="22">${number(hi)}</text><text x="35" y="237">${number(lo)}</text>${candles}<text x="35" y="336">${new Date(visible[0].time*1000).toISOString().slice(0,10)}</text><text x="635" y="336">${new Date(visible.at(-1).time*1000).toISOString().slice(0,10)}</text></svg><p class="muted">成交量使用獨立尺度。此來源未提供可驗證還原OHLC，僅顯示原始K線。</p>`);
}
const chartPending=new Map();let chartToken=0;
function interactiveChart(points,row){const token=String(++chartToken);chartPending.set(token,{points,row});return card(`${row.name} ${row.symbol}・原始 K 線`,`<div data-interactive-chart="${token}"></div>`);}
function mountCharts(root){root.querySelectorAll('[data-interactive-chart]').forEach(el=>{const data=chartPending.get(el.dataset.interactiveChart);if(data){const compare=document.createElement('section');compare.className='stack';el.after(compare);mountComparison(compare,el,`${data.row.name} ${data.row.symbol}`,{state,publicData});mountChart(el,data.points.map(p=>({...p,date:new Date(p.time*1000).toISOString().slice(0,10)})),`${data.row.name} ${data.row.symbol}`,compare);chartPending.delete(el.dataset.interactiveChart);}});}
function securityNavigation(symbol,active,isETF){const ids=isETF?['etf','candles','intraday','constituents','rebalance','etf-performance','fund','bond','records']:['security','candles','intraday','company','revenue','earnings','dividends','fair-value','valuation-evidence','flows','shareholders','margin','news','health','records'];return`<nav class="detail-sections" aria-label="個股詳情分區">${ids.map(id=>`<a href="#/${id}?symbol=${encodeURIComponent(symbol)}" ${id===active?'aria-current="page"':''}>${e(title(id))}</a>`).join('')}</nav>`;}
async function security(id,symbol){
  id=({'dark-security':'security','dark-etf':'etf'})[id]??id;
  if(id==='security'&&symbol)id=securityTarget(symbol);
  if(!symbol)return status('請先選擇證券','由股票列表開啟個股或ETF，即可查看此分區。','⌕')+card('',link('search'));
  const row=state.rows.find(r=>r.symbol===symbol)??{...identity(symbol,state.listing?.stocks?.[symbol])};
  const allowed=resolveListingStatus(symbol,taipeiDay(),state.listing).eligible;
  const isSaved=Object.values(favorites()).some(items=>items.includes(symbol));
  const liveBand=allowed&&['security','etf'].includes(id)?await modules.priceBand(symbol,row):null;
  const sourceBand=String(row.asOf??'').slice(0,10)===taipeiDay()&&[row.referencePrice,row.limitUp,row.limitDown].every(Number.isFinite)&&row.referencePrice>0&&row.limitUp>row.referencePrice&&row.limitDown>0&&row.limitDown<row.referencePrice;
  const limit=liveBand?.label??(allowed&&sourceBand?limitStatus(row):null),bandKnown=Boolean(liveBand?.valid||sourceBand);
  const limitHint=liveBand?.unlimited?(liveBand.unlimitedKind==='etf'?'<small class="muted">依官方基金類型・無漲跌幅限制</small>':'<small class="muted">上市首日・無漲跌幅限制</small>'):limit?`<span class="pill ${limit==='漲停'?'limit-up':'limit-down'}" aria-label="${limit}">${limit==='漲停'?'▲':'▼'} ${limit}</span>`:bandKnown?'<small class="muted">尚未觸及當日漲跌停價格</small>':'<small class="muted">漲跌停狀態：來源未提供完整價格帶，暫不判定</small>';
  const top=card('',`<h2>${e(row.name)} <small>${e(symbol)}</small></h2><button data-action="favorite" data-symbol="${e(symbol)}" aria-pressed="${isSaved}" aria-label="${isSaved?'從所有自選分類移除':'加入預設自選分類'} ${e(row.name)} ${e(symbol)}">${isSaved?'★ 已加入自選':'☆ 加入自選'}</button>${allowed?`<div class="hero-value ${movement(row.changePercent)}">${number(row.price)}</div><p class="${movement(row.changePercent)}">漲跌 ${format(row,'change')}</p><p class="${movement(row.changePercent)}">${format(row,'changePercent')}</p><p>成交量 ${format(row,'volume')}</p><small>原始市場價格・${e(row.asOf??'尚未同步')}</small>${limitHint}`:'<p>上市狀態尚未確認或不符合目前市場資格；僅保留個人歷史紀錄。</p>'}`)+securityNavigation(symbol,id,row.securityType==='fund');
  if(id==='records')return top+await personalRecords.page({symbol,name:row.name,price:row.price,asOf:row.asOf,eligible:allowed})+transactions(symbol);
  if(!allowed)return top+status('目前市場資料不可用','待確認上市狀態後才能載入行情與分析。','◇');
  if(row.securityType==='fund'&&matchMedia('(min-width:1100px)').matches&&['etf','constituents','rebalance','etf-performance','fund','bond'].includes(id))return await modules.detail('constituents',symbol,row);
  if(['security','etf','candles','intraday'].includes(id)){
    let etfOverview='';
    if(id==='etf'&&row.securityType==='fund'){
      try {
        const snapshots=await publicData('quant/etf/outputs/latest_snapshot.json'),fund=snapshots[symbol];
        if(fund){const disclosure=fundDisclosure(fund);etfOverview=card('ETF 基本資料',`<div class="metric-grid">${metric('基金分類',e(fund.category??'資料不足'))}${metric('商品類型',e(fund.type??'資料不足'))}${metric('基金資料日期',e(fundSnapshotDate(fund)??'來源日期不足'))}${metric('成分揭露日期',e(disclosure.date??'來源未提供'))}${metric('來源成分檔數',String(fund.holdings?.length??0))}${metric('揭露完整性',disclosure.complete?'來源已附完整證明':'部分揭露或完整性未確認')}</div><p>持倉來源狀態：${e(disclosure.origin)}；來源擷取時間：${e(disclosure.retrievedAt??'未提供')}${disclosure.reusedAt?`；沿用時間：${e(disclosure.reusedAt)}`:''}。</p><p class="muted">基金擷取日期不代表成分揭露日期；權重合計不能單獨證明完整性。詳細資料請查看成分與配置、配息與績效及基金資訊分區。</p>`);}
        else etfOverview=status('ETF 基本資料不足','來源尚未提供此基金的成分快照。');
      } catch(error) { etfOverview=status('ETF 基本資料暫不可用',error.message,'↗',true); }
    }
    const summary=top+etfOverview+(['security','etf'].includes(id)?card('關鍵數據',`<div class="metric-grid">${['open','high','low','volume','sector','market'].map((k,i)=>metric(['開盤','最高','最低','成交量','產業','市場'][i],typeof row[k]==='string'?e(row[k]||'資料不足'):number(row[k]))).join('')}</div>`):'');
    if(id==='intraday')return summary+await modules.intraday(symbol,row);
    try {const history=readChart(await publicData(`rebuild/charts/${encodeURIComponent(symbol)}.json`),symbol);return summary+interactiveChart(history,row);}
    catch(error){return summary+status('歷史圖表暫時無法載入',`${error.message}。基本行情仍可查閱，請稍後重試。`,'↗',true);}
  }
  const extra=await modules.detail(id,symbol,row);if(extra!==null)return top+extra;
  const periods={revenue:['monthly','月營收（千元）','value'],earnings:['quarterly','每股盈餘','eps'],dividends:['dividends','現金股利','cash']};
  if(periods[id]){const [path,label,key]=periods[id],data=await publicData(`${path}/${encodeURIComponent(symbol)}.json`);return top+(data.data??[]).map(r=>card(r.period??r.date,`<div class="metric-grid">${metric(label,number(r[key]))}${id==='earnings'?metric('ROE (%)',number(r.roe)):id==='revenue'?metric('年增率 (%)',number(r.yoy)):metric('股票股利',number(r.stock))}</div>`)).join('');}
  if(['constituents','fund','bond'].includes(id)){
    const payload=await publicData('quant/etf/outputs/latest_snapshot.json'),etf=payload[symbol];if(!etf)return top+status('基金資料不足','尚未取得正式基金揭露。');
    if(id!=='constituents')return top+card('基金資訊',`<p>${e(etf.name)} ${e(symbol)}</p>${metric('類別',e(etf.category??'資料不足'))}${metric('資料模式',e(etf.data_mode??'未知'))}${metric('資料日期',e(etf.as_of??etf.date??'來源未提供'))}`);
    const disclosure=fundDisclosure(etf);
    const holdings=etf.holdings??[],total=holdings.reduce((s,r)=>s+(Number.isFinite(r.weight)?r.weight:0),0);
    const rows=holdings.filter(r=>resolveListingStatus(r.stock_id,taipeiDay(),state.listing).eligible).map(r=>({...state.rows.find(x=>x.symbol===r.stock_id),...identity(r.stock_id,{name:r.stock_name},state.listing.stocks[r.stock_id]),weight:r.weight}));
    const quarterly=await quarterlyFundHoldingsPanel({state,publicData,publicBytes,status,card,rowList},symbol,{name:etf.name});
    return top+card('揭露狀態',`<p>${e(etf.data_mode??'揭露完整性未知')}・原始權重合計 ${number(total)}%</p><p>${disclosure.complete?'來源已附完整揭露證明':'部分揭露或完整性未確認'}</p><p>成分揭露日期：${e(disclosure.date??'來源未提供')}；成分來源：${e(disclosure.source??'來源未提供')}</p><p>持倉來源狀態：${e(disclosure.origin)}；來源擷取時間：${e(disclosure.retrievedAt??'未提供')}${disclosure.reusedAt?`；沿用時間：${e(disclosure.reusedAt)}`:''}</p><p class="muted">原始權重未正規化成100%，權重合計不代表完整性證明。可列入台股行情 ${rows.length}／來源 ${holdings.length} 筆；未通過台股資格的資產不列入行情，亦不視為不存在。</p>`)+rowList(rows,`constituents.${symbol}`)+quarterly;
  }
  return top+unfinished(id);
}
function transactions(symbol){const trades=state.checkpoint?.trades??[];const selected=trades.filter(r=>!symbol||String(r.symbol??r.stock_id)===symbol);return card('原有交易紀錄',`<p>共 ${selected.length} 筆・唯讀相容讀取</p><p class="muted">原 IndexedDB 名稱、儲存區與所有紀錄保持原狀。</p>`)+(selected.length?selected.map(tx=>{const s=String(tx.symbol??tx.stock_id??'').trim(),rawName=String(tx.name??tx.stockName??'').trim(),stock=identity(s,rawName&&rawName!==s?{name:rawName}:null,state.rows.find(r=>r.symbol===s),state.listing?.stocks?.[s]);return card(`${stock.name} ${stock.symbol}`,`<div class="metric-grid">${(tx.type??tx.side)==='配息'?metric('入帳金額（原交易幣別）',number(cashflowRecords([tx]).records[0]?.amount)):metric('歷史成交價',number(tx.price))+metric('成交股數',number(tx.shares??tx.quantity))}${metric('交易日期',e(tx.date??tx.tradeDate??tx.trade_date??'格式待確認'))}${metric('交易類別',e(tx.type??tx.side??'格式待確認'))}</div>${s?link('records','查看個股紀錄',s):''}`);}).join(''):status('尚無交易紀錄','目前瀏覽器尚未保存交易資料。','▤'));}
async function content(id,symbol){
  const item=state.contract.routes.find(r=>r.id===id);
  if(!item)return status('找不到此頁面','請從底部導航重新選擇。');
  if(item.tab==='security'||['dark-security','dark-etf'].includes(id))return security(id,symbol);
  if(id==='heatmap'){const rows=state.rows.filter(r=>resolveListingStatus(r.symbol,taipeiDay(),state.listing).eligible&&r.securityType!=='fund'&&r.sector!=='ETF'&&r.industry!=='ETF'&&Number.isFinite(r.turnover)&&r.turnover>0&&Number.isFinite(r.changePercent));return rows.length?card('市場熱力圖',`<p class="muted">有效行情成交值前150檔，排除 ETF，優先按產業分組；面積依原始成交值，顏色使用原始市場價格漲跌幅。資料日期：${e(state.index?.latest_daily_tw??'資料日期不足')}。點選方塊開啟個股。</p><div data-heatmap aria-label="按產業分組的成交值熱力圖"></div>`)+rowList(rows,'heatmap'):status('熱力圖資料不足','需要有效原始成交值與市場參考價；缺少資料時不以還原價格代替。');}
  if(id==='overview')return marketOverview({state,card,metric,link,rowList,publicData});
  if(['watchlist','dark-watchlist'].includes(id))return card('',link('search','⌕ 搜尋股票')+link('groups','自選分類管理'))+`<label>自選分類<select id="watch-group"><option value="all">全部自選</option>${Object.keys(favorites()).map(k=>`<option value="${e(k)}" ${k===state.group?'selected':''}>${e(groupLabel(k))}</option>`).join('')}</select></label>`+rowList(chooseRows(),'watchlist');
  if(id==='search')return `<label>搜尋股票<input id="stock-search" type="search" value="${e(state.query)}" placeholder="股票名稱或代號" autocomplete="off"></label>`+rowList(state.rows.filter(r=>`${r.name} ${r.symbol}`.toLowerCase().includes(state.query.toLowerCase())),'search');
  if(id==='groups')return groupsPage();
  if(['explore','more'].includes(id))return state.contract.routes.filter(r=>r.tab===id&&r.id!==id).map(r=>card('',link(r.id))).join('');
  if(id==='etfs')return rowList(state.rows.filter(r=>r.securityType==='fund'&&`${r.name} ${r.symbol} ${r.sector}`.toLowerCase().includes(state.query.toLowerCase())),'etfs');
  if(id==='appearance')return card('主題模式',`<label>外觀<select id="appearance"><option value="system">系統</option><option value="light">淺色</option><option value="dark">深色</option></select></label><p>文字隨瀏覽器字級調整；漲紅跌綠並保留正負號。</p><label>桌面單擊股票<select id="desktop-open-mode"><option value="preview" ${desktopOpenMode()==='preview'?'selected':''}>在工作台預覽</option><option value="detail" ${desktopOpenMode()==='detail'?'selected':''}>開啟完整詳情</option></select></label><p class="muted">雙擊或在整列按 Enter 開啟完整詳情；手機點選仍直接進入詳情。</p><p id="desktop-open-feedback" role="status"></p>`);
  if(id==='sync')return card('資料同步狀態',`${metric('台股歷史行情',e(state.index?.latest_daily_tw??'尚未同步'))}${metric('大盤行情',e(state.index?.latest_daily_tw_indices??'尚未同步'))}${metric('上市狀態確認',e(state.listing?.cutoff??'尚未確認'))}<button class="primary" data-action="reload">重新載入資料</button>`);
  if(['fields','field-order'].includes(id))return card('顯示欄位',fieldsEditor('watchlist'));
  if(id==='list-preview')return rowList(chooseRows(),'watchlist');
  if(id==='empty')return status('尚未加入自選股','搜尋股票，建立您的觀察清單。','☆')+card('',link('search'));
  if(['error','startup-error'].includes(id))return status('資料載入失敗','既有本機資料仍保留。請檢查網路或至資料同步重試。','!',true);
  if(id==='offline')return card('離線模式',`<p>本頁只顯示已在記憶體讀取的資料。</p><small>行情日期：${e(state.index?.latest_daily_tw??'尚未載入')}</small>`)+rowList(chooseRows(),'watchlist');
  if(['preflight','upgrade'].includes(id))return card('資料保留狀態',`<p>原 IndexedDB：TWStockTrackerDB／trades</p><p>原有交易 ${state.checkpoint?.count??0} 筆</p><p class="source muted">備份 checksum：${e(state.checkpoint?.hash??'尚未完成')}</p><p>目前採相容讀取，未變更原有儲存格式。</p><button data-action="diagnostics">匯出診斷摘要</button><p class="muted">摘要僅含檢查階段、筆數與 checksum，不含交易內容或服務金鑰。</p>`);
  return unfinished(id);
}
const modules=featureModules({state,card,metric,status,rowList,link,publicData,publicBytes,title,transactions,navigate,fieldsEditor,chooseRows,refresh:render});
modules.listen(app);
function launch(){return`<main id="main"><section class="launch" data-route="launch"><div class="brandmark" aria-hidden="true">↗</div><div><h1>TWStockTracker</h1><p class="muted">看懂市場，掌握每一步。</p></div>${card('您的投資紀錄，就在這裡','<p>◇ 沿用原有自選與交易資料</p><p>▦ 市場・自選・探索・資產</p>')}${state.showStartupCompletion?status('本機資料檢查完成','原有紀錄仍保留在原位置。','✓'):''}<button class="primary" data-action="start">開始使用</button><p class="muted">資料不足或離線時，會清楚標示資料狀態。</p></section></main>`;}
let workspaceCleanup,panelCleanup;
async function render(){
  if(!state.startupReady)return;
  saveRouteState();
  const routeHash=location.hash;
  if(lastHash!==routeHash){const savedState=routeStates.get(routeHash);state.query=savedState?.query??'';state.group=savedState?.group??'all';state.inspector=savedState?.inspector??null;}
  lastHash=routeHash;routeLoading=true;
  workspaceCleanup?.();
  panelCleanup?.();panelCleanup=null;
  heatmapCleanup?.();heatmapCleanup=null;
  const current=++generation,{id,symbol}=route();
  document.documentElement.dataset.theme=id.startsWith('dark-')?'dark':localStorage.getItem('rebuild.appearance.v1')??'system';
  if(id==='launch'){app.innerHTML=launch();routeLoading=false;return;}
  const item=state.contract.routes.find(r=>r.id===id),tab=['market','watchlist','explore','assets','more'].includes(item?.tab)?item.tab:'market';
  app.innerHTML=`<header class="topbar"><span class="brand">TWStockTracker</span><button data-action="back" aria-label="返回">‹</button><h1>${e(title(id))}</h1><a href="#/search" aria-label="搜尋股票">⌕</a>${workspaceControls(tab)}</header><div class="workspace"><main id="main" class="page" data-route="${e(id)}">${status('載入中','正在讀取頁面資料…')}</main><div class="workspace-divider" role="separator" tabindex="0" aria-label="調整詳情面板寬度" aria-orientation="vertical" aria-valuemin="25" aria-valuemax="48"></div><aside class="desktop-inspector" aria-label="個股檢查器">${status('個股摘要','點選清單，在這裡並列檢視行情。')}</aside><aside class="desktop-research-detail" aria-label="基本資料與近期觀察">${status("基本資料與近期觀察","選擇股票後，在此並列閱讀資料與來源日期。")}</aside></div><nav class="bottom-nav" aria-label="主要分頁">${state.contract.tabs.map(t=>`<a href="#/${t.root}" ${t.id===tab?'aria-current="page"':''}><span class="nav-icon" aria-hidden="true">${symbols[t.id]}</span><span>${e(t.title)}</span></a>`).join('')}</nav>`;
  try{
    const extension=await modules.page(id,symbol);const body=extension??await content(id,symbol);if(current!==generation)return;
    document.querySelector('#main').innerHTML=(state.error?`<div class="alert" role="alert">${e(state.error)} <button data-action="reload">重試</button></div>`:'')+body;
    mountCharts(document.querySelector('#main'));
    workspaceCleanup=mountWorkspace(app,tab);
    panelCleanup=mountPanelLayout(app);
    if(state.inspector&&!app.querySelector('.desktop-page'))inspect(state.inspector);
    const heatmap=document.querySelector('[data-heatmap]');if(heatmap)heatmapCleanup=mountHeatmap(heatmap,state.rows);
    document.title=`${title(id)} · TWStockTracker`;
    if(id==='appearance')document.querySelector('#appearance').value=localStorage.getItem('rebuild.appearance.v1')??'system';
    const saved=scrolls.get(routeHash);window.scrollTo(0,saved??0);
    if(state.inspector){const selected=app.querySelector(`[data-row-stock="${CSS.escape(state.inspector)}"]`);selected?.focus({preventScroll:true});}
    routeLoading=false;
    const query=document.querySelector('#stock-search');if(query&&state.query){query.focus({preventScroll:true});query.setSelectionRange?.(state.query.length,state.query.length);}
  }catch(error){if(current===generation){document.querySelector('#main').innerHTML=status('資料載入失敗',error.message,'!',true);routeLoading=false;window.scrollTo(0,scrolls.get(routeHash)??0);}}
}
async function renderResearchPanel(symbol){const target=document.querySelector('.desktop-research-detail');if(!target)return;target.innerHTML=status('載入中','正在讀取基本資料與近期觀察…');try{const html=await researchPanel({state,card,metric,status,publicData},symbol);if(target.isConnected&&state.inspector===symbol)target.innerHTML=html;}catch(error){if(target.isConnected&&state.inspector===symbol)target.innerHTML=status('基本資料暫不可用',error.message);}}
// Canonical navigation target shared by cards, tables, keyboard and inspectors.
function securityTarget(symbol){
 const type=state.rows.find(row=>row.symbol===symbol)?.securityType??state.listing?.stocks?.[symbol]?.securityType;
 return type==='fund'?'etf':'security';
}
function desktopOpenMode(){try{return localStorage.getItem('rebuild.desktopOpen.v1')==='detail'?'detail':'preview';}catch{return 'preview';}}
async function selectStock(symbol){if(!matchMedia('(min-width:1100px)').matches||desktopOpenMode()==='detail')navigate(securityTarget(symbol),symbol);else await inspect(symbol);}
async function inspect(symbol){
 state.inspector=symbol;markWorkspaceSelection(app,symbol);
 const target=document.querySelector('.desktop-inspector');if(!target)return;
 const overlay=Boolean(app.querySelector('.desktop-page'));target.classList.toggle('inspector-overlay',overlay);
 if(!overlay)renderResearchPanel(symbol);
 const actions=`<div class="toolbar"><button data-close-inspector>關閉預覽</button>${link(securityTarget(symbol),'開啟完整詳情',symbol)}</div>`;
 target.innerHTML=actions+status('載入中','正在讀取個股…');
 try{const html=await security(securityTarget(symbol),symbol);if(target.isConnected&&state.inspector===symbol){target.innerHTML=actions+html;mountCharts(target);}}
 catch(error){if(target.isConnected&&state.inspector===symbol)target.innerHTML=actions+status('資料載入失敗',error.message);}
}
app.addEventListener('click',event=>{const close=event.target.closest('[data-close-inspector]');if(!close)return;state.inspector=null;const target=close.closest('.desktop-inspector');target.classList.remove('inspector-overlay');target.innerHTML=status('個股預覽','選擇股票後可在此閱讀資料。');markWorkspaceSelection(app,'');app.querySelector('tr[data-row-stock]')?.focus();});
app.addEventListener('keydown',event=>{const row=event.target.closest('tr[data-row-stock]');if(event.target!==row||!row)return;if(event.key==='Enter'){event.preventDefault();navigate(securityTarget(row.dataset.rowStock),row.dataset.rowStock);}if(event.key===' '){event.preventDefault();selectStock(row.dataset.rowStock);}});

function setTheme(value){document.documentElement.dataset.theme=value;localStorage.setItem('rebuild.appearance.v1',value);}
app.addEventListener('click',async event=>{
  const stock=event.target.closest('[data-stock]');if(stock&&matchMedia('(min-width:1100px)').matches&&event.detail!==2&&!event.ctrlKey&&!event.metaKey){if(event.detail===0)return;event.preventDefault();await selectStock(stock.dataset.stock);return;}
  const cell=event.target.closest('[data-select-stock]');if(cell){await selectStock(cell.dataset.selectStock);return;}
  const button=event.target.closest('[data-action]');if(!button)return;
  const {action,context,symbol,field:f,offset}=button.dataset;
  try{
    if(action==='diagnostics'){
      const report={schemaVersion:1,platform:'web',stage:state.startupStage??'not-started',status:state.startupFailure?'STARTUP_FAILED':state.checkpoint?'CHECKPOINT_AVAILABLE':'NO_CHECKPOINT',exportedAt:new Date().toISOString(),checkpointAvailable:!!state.checkpoint,checkpointChecksum:state.checkpoint?.hash??null,transactionCount:state.checkpoint?.count??null,online:navigator.onLine,containsPersonalRecords:false,containsServiceCredentials:false};
      const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'})),anchor=document.createElement('a');anchor.href=url;anchor.download='twstock-startup-diagnostics.json';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;
    }
    if(action==='retry-startup'){button.disabled=true;await start();return;}
    if(action==='group-members'){openGroup(button.dataset.group);return;}
    if(['group-up','group-down'].includes(action)){await mutateFavorites(groups=>{const entries=Object.entries(groups),i=entries.findIndex(([key])=>key===button.dataset.group),j=i+(action==='group-up'?-1:1);if(i>=0&&j>=0&&j<entries.length)[entries[i],entries[j]]=[entries[j],entries[i]];return Object.fromEntries(entries);});await render();return;}
    if(['member-up','member-down','member-remove'].includes(action)){const key=button.dataset.group;await mutateFavorites(groups=>{const items=groups[key]??[],i=items.indexOf(symbol);if(i>=0){if(action==='member-remove')items.splice(i,1);else{const j=i+(action==='member-up'?-1:1);if(j>=0&&j<items.length)[items[i],items[j]]=[items[j],items[i]];}}return groups;});document.querySelector('dialog').innerHTML=groupMembers(key);return;}
    if(action==='start'){state.showStartupCompletion=false;try{localStorage.setItem('rebuild.startupCompletionAcknowledged.v1','1');}catch{}navigate('overview');}
    if(action==='back'){if(history.length>1)history.back();else navigate('overview');}
    if(action==='favorite'){await mutateFavorites(groups=>{if(Object.values(groups).some(items=>items.includes(symbol))){for(const key of Object.keys(groups))groups[key]=groups[key].filter(item=>item!==symbol);}else{groups.cat1??=[];groups.cat1.push(symbol);}return groups;});await render();}
    if(action==='reload'){button.disabled=true;cache.clear();state.error=null;state.offline=!navigator.onLine;try{state.listing=await json('./listing-eligibility.json');await loadMarket();}catch(error){state.error=error.message;}await render();}
    if(action==='fields')openFields(context);
    if(action==='close-fields')document.querySelector('dialog')?.close();
    if(['reverse','sort-field','add-field','hide-field','move-field','reset-fields'].includes(action)){
      let p=pref(context);
      if(action==='reverse')p.descending=!p.descending;
      if(action==='sort-field'){p.sort=f;p.manual=false;}
      if(action==='add-field'&&!p.fields.includes(f))p.fields.push(f);
      if(action==='hide-field')p.fields=p.fields.filter(x=>x!==f);
      if(action==='move-field'){const i=p.fields.indexOf(f),j=i+Number(offset);if(i>=0&&j>=0&&j<p.fields.length)[p.fields[i],p.fields[j]]=[p.fields[j],p.fields[i]];}
      if(action==='reset-fields')p=defaultPreference();savePref(context,p);
      const dialog=document.querySelector('dialog');if(dialog?.open)dialog.innerHTML=fieldsEditor(context);else await render();
    }
    if(action==='chart-zoom'){state.chartCount=Math.max(10,Math.min(1000,state.chartCount+Number(offset)));await render();}
    if(action==='backup'){state.checkpoint=await preflight();const blob=new Blob([JSON.stringify(exportBackup(state.checkpoint),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`TWStockTracker-backup-${taipeiDay()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  }catch(error){const notice=document.createElement('p');notice.className='alert';notice.role='alert';notice.textContent=error.message;button.after(notice);}
});
app.addEventListener('dblclick',event=>{if(event.target.closest('button,input,select,[data-column-resize]'))return;const row=event.target.closest('[data-row-stock]'),stock=event.target.closest('[data-stock]');const symbol=row?.dataset.rowStock||stock?.dataset.stock;if(symbol)navigate(securityTarget(symbol),symbol);});
app.addEventListener('change',async event=>{const t=event.target;if(t.id==='desktop-open-mode'){try{localStorage.setItem('rebuild.desktopOpen.v1',t.value);document.querySelector('#desktop-open-feedback').textContent='桌面操作偏好已保存。';}catch{document.querySelector('#desktop-open-feedback').textContent='無法保存偏好，請確認瀏覽器儲存權限。';}}if(t.dataset.sort){const p=pref(t.dataset.sort);p.manual=t.value==='manual';if(!p.manual)p.sort=t.value;savePref(t.dataset.sort,p);await render();}if(t.id==='appearance')setTheme(t.value);if(t.id==='watch-group'){state.group=t.value;await render();}if(t.id==='chart-period'){state.chartCount=Number(t.value);await render();}});
let queryTimer;app.addEventListener('input',event=>{if(event.target.id==='stock-search'){state.query=event.target.value;clearTimeout(queryTimer);queryTimer=setTimeout(render,150);}});
app.addEventListener('submit',async event=>{if(event.target.id==='add-group'){event.preventDefault();const name=new FormData(event.target).get('name').trim();if(!name)return;try{await mutateFavorites(groups=>{if(!Object.hasOwn(groups,name))Object.defineProperty(groups,name,{value:[],writable:true,enumerable:true,configurable:true});return groups;});await render();}catch(error){state.error=error.message;await render();}}});
let dragging;app.addEventListener('dragstart',event=>{const el=event.target.closest('[data-drag-field]');if(el){dragging=el.dataset;event.dataTransfer.setData('text/plain',el.dataset.dragField);}});app.addEventListener('dragover',event=>{if(event.target.closest('[data-drag-field]'))event.preventDefault();});app.addEventListener('drop',async event=>{const el=event.target.closest('[data-drag-field]');if(!el||!dragging||dragging.context!==el.dataset.context)return;event.preventDefault();const p=pref(dragging.context),i=p.fields.indexOf(dragging.dragField),j=p.fields.indexOf(el.dataset.dragField);if(i<0||j<0)return;p.fields.splice(j,0,p.fields.splice(i,1)[0]);savePref(dragging.context,p);const d=document.querySelector('dialog');if(d?.open)d.innerHTML=fieldsEditor(dragging.context);else await render();});
window.addEventListener('scroll',()=>{if(!routeLoading&&lastHash===location.hash)scrolls.set(lastHash,scrollY);},{passive:true});window.addEventListener('hashchange',()=>{render();});window.addEventListener('offline',()=>{state.offline=true;state.error='目前離線，顯示已讀取的資料與原始資料日期。';render();});
for(const eventName of ['click','change','submit'])app.addEventListener(eventName,event=>{
 if(state.startupReady)return;
 const action=event.target.closest?.('[data-action]')?.dataset.action;
 if(eventName==='click'&&['retry-startup','diagnostics'].includes(action))return;
 event.preventDefault();event.stopImmediatePropagation();
},{capture:true});
async function start(){
 if(state.startupBusy)return;
 state.startupBusy=true;state.startupReady=false;++generation;
 state.startupFailure=false;state.checkpoint=null;state.error=null;state.startupStage='storage-recovery';
 app.innerHTML=`<main id="main" class="launch">${status('啟動檢查中','正在保留並檢查本機資料，請稍候。')}</main>`;
 try{
  await recoverStorage();state.startupStage='route-contract';state.contract=await json('./routes.json');
  state.startupStage='safety-checkpoint';state.checkpoint=await preflight();
  state.startupStage='watchlist-migration';
  const favoritesMigration=await migrateLegacyFavorites();
  state.startupStage='list-preference-migration';
  const listMigration=await migrateLegacyListPreferences(legacyListPreferenceMigrations());
  if(favoritesMigration.migrated||listMigration.migrated)state.checkpoint=await preflight();
  state.startupStage='listing-boundary';state.listing=await json('./listing-eligibility.json');
  setTheme(localStorage.getItem('rebuild.appearance.v1')??'system');
  state.startupStage='market-sources';try{await loadMarket();}catch(error){state.error=error.message;}
  state.showStartupCompletion=localStorage.getItem('rebuild.startupCompletionAcknowledged.v1')!=='1';
  state.startupStage='ready';state.startupReady=true;await render();
 }catch(error){
  state.startupFailure=true;state.startupReady=false;
  app.innerHTML=`<main id="main" class="launch">${status('啟動檢查未完成',error.message+'。原始資料已保留。','!',false)}<button data-action="retry-startup">保留原資料並重試</button><button data-action="diagnostics">匯出診斷摘要</button><p>摘要不含交易內容、偏好值或服務金鑰。</p></main>`;
 }finally{state.startupBusy=false;}
}
let eligibilityDay=taipeiDay();setInterval(()=>{if(taipeiDay()!==eligibilityDay){eligibilityDay=taipeiDay();state.rows=[];state.error='日期已變更，上市狀態須重新確認；請同步資料。';render();}},30000);
window.addEventListener('online',async()=>{if(!state.startupReady)return;state.offline=false;state.error=null;cache.clear();try{state.listing=await json('./listing-eligibility.json');await loadMarket();}catch(error){state.error=error.message;}await render();});
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(()=>{});
await start();



app.addEventListener('change',async event=>{const t=event.target;if(!t.dataset.memberMove||!t.value)return;const source=t.dataset.group,destination=t.value,symbol=t.dataset.memberMove;try{await mutateFavorites(groups=>{if(Object.hasOwn(groups,destination)&&Object.hasOwn(groups,source)){groups[source]=groups[source].filter(x=>x!==symbol);groups[destination]=[...new Set([...groups[destination],symbol])];}return groups;});document.querySelector('dialog').innerHTML=groupMembers(source);}catch(error){state.error=error.message;await render();}});
app.addEventListener('submit',async event=>{if(event.target.id!=='group-add-member')return;event.preventDefault();const form=event.target,key=form.dataset.group,symbol=String(new FormData(form).get('symbol')).trim().toUpperCase(),row=state.rows.find(r=>r.symbol===symbol);if(!row){form.querySelector('[role=status]').textContent='查無已確認上市的股票；既有自選資料仍保留。';return;}try{await mutateFavorites(groups=>{if(Object.hasOwn(groups,key))groups[key]=[...new Set([...groups[key],symbol])];return groups;});document.querySelector('dialog').innerHTML=groupMembers(key);}catch(error){form.querySelector('[role=status]').textContent=error.message;}});

matchMedia('(min-width: 1100px)').addEventListener('change',()=>render());

app.addEventListener('click',event=>{const anchor=event.target.closest('a[href^="#"]');if(anchor){if(anchor.dataset.stock)state.inspector=anchor.dataset.stock;saveRouteState();}},{capture:true});
window.addEventListener('pagehide',saveRouteState);
