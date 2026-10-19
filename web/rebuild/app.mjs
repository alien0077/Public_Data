import {createPersonalRecords} from './personal-records.mjs?v=2';
import {d06FieldTitle,d06FieldValue} from './field-presentation.mjs?v=1';
import {profitLossClass} from './assets.mjs?v=3';
import {fundDisclosure,fundSnapshotDate} from './etf.mjs';
import {mountComparison} from './comparison.mjs?v=2';
import {mountWorkspaceKeys,markWorkspaceSelection} from './workspace-keys.mjs';
import {mountPanelLayout} from './panel-layout.mjs?v=2';
import {columnWidth,columnHandle,mountColumnWidths} from './column-widths.mjs';
import {researchPanel} from './research-panel.mjs';
import {marketOverview} from './market.mjs?v=62';
import {exploreMarketMarkup} from './explore-market.mjs?v=3';
import {verifiedMarketTurnover} from './market-turnover.mjs?v=2';
import {workspaceControls,mountWorkspace} from './desktop.mjs';
import {cashflowRecords} from './cashflow.mjs';
import {mountHeatmap} from './heatmap.mjs?v=20';
import {mountChart} from './chart.mjs?v=53';
import {detailRouteRequiresListingEligibility,listingWarningAppliesToRoute,loadCanonicalListingSnapshot,marketQuoteWarningAppliesToRoute,navigationForRouteContent,primaryTabForRoute,previewSymbolForRoute,securityNavigationForRoute} from './navigation.mjs?v=14';
import {marketTabs} from './market-tabs.mjs';
import {conceptTabs} from './concept-tabs.mjs?v=3';
import {moreMenuMarkup} from './more-menu.mjs';
import {calculateFinancialTool,financialToolsMarkup} from './financial-tools.mjs';
import {bottomNavMarkup} from './bottom-nav.mjs';
import {transactionStockActions} from './transaction-actions.mjs?v=1';
import {desktopCompanyFinancials} from './desktop-company-financials.mjs';
import {desktopSecurityWatchRows} from './desktop-pages.mjs?v=71';
import {desktopSecurityUnavailableContent} from './desktop-security-unavailable.mjs?v=1';
import {featureModules} from './features.mjs?v=133';
import {number,escapeHTML as e,taipeiDay,resolveListingStatus,identity,rawRow,searchDirectoryRows,favoriteSearchCandidates,canonicalUSIndexRows,withPriceReference,validPriceReferenceContract,limitStatus,defaultPreference,normalizePreference,sortRows,readChart,loadRecentDailyChart,changeFromRecentRawCloses,withPreviousRawClose,updateExchangeClocks} from './core.mjs?v=52';
import {preflight,favorites,mutateFavorites,recoverStorage,migrateLegacyListPreferences,exportBackup} from './storage.mjs?v=3';
const app=document.querySelector('#app');
setInterval(()=>updateExchangeClocks(document),15_000);
const LISTING_EXPIRY_MESSAGE='目前無法讀取 Public_Data meta/stocks.json，股票現行清單暫停顯示；請重新載入資料。';
const personalRecords=createPersonalRecords(app,{card,status});
mountColumnWidths(app);
mountWorkspaceKeys(app,inspect);
function savedChartCount(){try{return ({'1m':20,'3m':60,'6m':120,'1y':250,all:250}[localStorage.getItem('rebuild.chart.default-range.v1')??'6m']??120);}catch{return 120;}}
const state={contract:null,listing:null,index:null,rows:[],indices:[],exploreMarketQuotes:{},marketTurnover:null,stockMetadata:new Map(),checkpoint:null,error:null,offline:false,loaded:false,group:'all',query:'',searchType:'all',inspector:null,chartCount:savedChartCount(),showStartupCompletion:false};
const D06_FIELDS=['price','change','changePercent','volume','turnover','open','high','low','prevClose','pe','yield'];
const D06_DEFAULT_FIELDS=['price','change','changePercent','volume','turnover','open','high'];
const EXTRA_FIELD_TITLES={open:'開盤',high:'最高',low:'最低',prevClose:'昨收'};
const cache=new Map(),scrolls=new Map();let generation=0,lastHash='',heatmapCleanup=null,routeLoading=false;
const routeStates=new Map();
if('scrollRestoration' in history)history.scrollRestoration='manual';
function saveRouteState(){if(!lastHash||routeLoading)return;scrolls.set(lastHash,window.scrollY);routeStates.set(lastHash,{query:state.query,group:state.group,inspector:state.inspector});}
function field(id){return state.contract.fields.find(f=>f.id===id)??{id,title:EXTRA_FIELD_TITLES[id]??id};}
function format(row,id){const value=id==='prevClose'?row.referencePrice:row[id];if(id==='sector')return e(value||'資料不足');if(value==null)return'資料不足';if(id==='weight'&&row.weightIsDelta)return `${number(value)} pp`;if(['changePercent','weight','yield'].includes(id))return`${value>0&&id==='changePercent'?'+':''}${number(value)}%`;return number(value,['volume','shares','marketCap'].includes(id)?0:2);}
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
  if(!v&&context==='watchlist')v={version:1,fields:[...D06_DEFAULT_FIELDS],sort:'changePercent',descending:true,manual:true};
  if(!v&&['institutional','quick-filter'].includes(context))v={version:1,fields:context==='institutional'?['price','institutionalNet','trackingDays']:['price','institutionalNet','buyDays'],sort:'institutionalNet',descending:true};
  if(!v&&context.startsWith('rebalance.'))v={version:1,fields:['weight'],sort:'weight',descending:true};
  if(!v&&context==='sector-pe')v={version:1,fields:['pe','eps','price'],sort:'pe',descending:false};
  if(!v&&context.startsWith('desktop.market.')){const sort=context.split('.').at(-1);v={version:1,fields:[...new Set(['price',sort,'volume','turnover'])],sort,descending:true};}
  if(!v&&context==='overview.turnover')v={version:1,fields:['price','turnover'],sort:'turnover',descending:true};
  if(!v&&context==='overview.volume')v={version:1,fields:['price','volume'],sort:'volume',descending:true};
  if(!v&&context==='hot')v={version:1,fields:['price','volume','turnover'],sort:'volume',descending:true};
  if(!v&&context==='quant')v={version:1,fields:['price','score','weight'],sort:'score',descending:true};
  if(!v&&context==='quant.value')v={version:1,fields:['price','pe','score'],sort:'pe',descending:false};
  if(!v&&context==='holdings')v={version:1,fields:['price','shares','cost','pnl'],sort:'shares',descending:true};
  if(!v&&context.startsWith('constituents.'))v={version:1,fields:['weight','price','changePercent'],sort:'weight',descending:true};
  const available=state.contract.fields.map(f=>f.id);if(context==='watchlist')available.push('open','high','low','prevClose');
  const normalized=normalizePreference(v,available);
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
function route(){const [name,query='']=(location.hash.slice(1)||'/launch').split('?');const params=new URLSearchParams(query);return{id:name.replace(/^\//,''),symbol:params.get('symbol'),panel:params.get('panel'),section:params.get('section'),category:params.get('category'),subsection:params.get('subsection')};}
function themeForRoute(id){if(id.startsWith('dark-'))return'dark';const saved=localStorage.getItem('rebuild.appearance.v1');if(saved==='light'||saved==='dark')return saved;return matchMedia('(min-width:1100px)').matches?'dark':'system';}
function applyAppearancePreferences(){let size=3,color='taiwan';try{size=Math.max(0,Math.min(6,Number(localStorage.getItem('rebuild.appearance.font-size.v1')??3)));color=localStorage.getItem('rebuild.market.colorStyle.v1')??'taiwan';}catch{}document.documentElement.style.setProperty('--font-scale',String(.8+size/15));document.documentElement.dataset.marketColor=color==='western'?'western':'taiwan';}
function monthlyReminderMarkup(){try{if(localStorage.getItem('rebuild.monthly-reports-reminder.v1')==='false')return'';const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(x=>[x.type,x.value]));if(Number(parts.day)<10)return'';const month=`${parts.year}-${parts.month}`;if(localStorage.getItem('rebuild.monthly-reminder.last.v1')===month)return'';localStorage.setItem('rebuild.monthly-reminder.last.v1',month);return `<p class="monthly-report-reminder" role="status">每月財報提醒：查看本月營收與財報更新；資料以 Public_Data 為準。</p>`;}catch{return'';}}
function title(id){return state.contract?.routes.find(r=>r.id===id)?.title??id;}
function link(id,label=title(id),symbol){return`<a class="directory-link" href="#/${e(id)}${symbol?'?symbol='+encodeURIComponent(symbol):''}"><span>${e(label)}</span><span aria-hidden="true">›</span></a>`;}
function card(name,body,className=''){return`<section class="card ${e(className)}">${name?`<h2>${e(name)}</h2>`:''}${body}</section>`;}
function metric(name,value,css=''){return`<div class="metric"><small>${e(name)}</small><span class="value ${css}">${value}</span></div>`;}
function status(name,message,icon='▤',retry=false){return`<section class="card state" role="status"><span class="state-icon" aria-hidden="true">${icon}</span><h2>${e(name)}</h2><p class="muted">${e(message)}</p>${retry?'<button data-action="reload">重試</button>':''}</section>`;}
function unfinished(id){return status(`${title(id)}尚未接通`,'此功能仍在重建與資料比對階段，尚未開放操作。','◇');}
async function json(url,{reload=false}={}){
 const absolute=new URL(url,location.href).href;
 const memory=reload?null:cache.get(absolute);if(memory&&memory.expiresAt>Date.now())return memory.data;
 const ttl=absolute.endsWith('/index-intraday.json')||absolute.endsWith('/listing-eligibility.json')?60000:300000;
 try {const requestURL=reload?`${absolute}${absolute.includes('?')?'&':'?'}_reload=${Date.now()}`:absolute;const response=await fetch(requestURL,{cache:reload?'reload':'no-cache',signal:AbortSignal.timeout(20000)});if(!response.ok){const error=new Error(`資料讀取失敗（${response.status}）`);error.status=response.status;throw error;}let data;
  if(absolute.endsWith('.json.gz')){
   const bytes=new Uint8Array(await response.arrayBuffer());
   if(bytes[0]===0x1f&&bytes[1]===0x8b){
    if(typeof DecompressionStream!=='function')throw new Error('此瀏覽器不支援 gzip 估值明細；請更新 Safari 或改用 iOS App。');
    const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    data=await new Response(stream).json();
   }else data=JSON.parse(new TextDecoder().decode(bytes));
  }else data=await response.json();
  cache.set(absolute,{data,expiresAt:Date.now()+ttl});if('caches'in window){try{const c=await caches.open('twstock-rebuild-v1');await c.put(absolute,new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}}));}catch{}}return data;}
 catch(error){if(reload)throw error;if('caches'in window){const saved=await caches.match(absolute);if(saved){const data=await saved.json();state.offline=true;state.error='來源連線失敗，顯示快取與原始資料日期。上市狀態仍依今日有效期驗證。';cache.set(absolute,{data,expiresAt:Date.now()+15000});return data;}}throw error;}
}
async function publicData(path,options){return json(new URL(`../../data/${path}`,location.href).href,options);}
function isoWeekBounds(value){const m=/^(\d{4})-W(\d{2})$/.exec(value);if(!m)return null;const jan4=new Date(Date.UTC(Number(m[1]),0,4)),day=jan4.getUTCDay()||7,start=new Date(jan4);start.setUTCDate(jan4.getUTCDate()-day+1+(Number(m[2])-1)*7);const end=new Date(start);end.setUTCDate(start.getUTCDate()+6);return{start,end};}
async function prefetchRecentRawMonth(button){
 if(button.dataset.busy==='1')return;button.dataset.busy='1';button.disabled=true;
 const statusNode=document.querySelector('#raw-month-progress');let completed=0,succeeded=0,persisted=0,failures=[];
 try{
  const index=await publicData('index.json'),groups=[['daily/tw',index.available_days_tw],['daily/tw_indices',index.available_days_tw_indices],['daily/tw_market_margin',index.available_days_tw_market_margin],['daily/us',index.available_days_us],['quant/etf/outputs/etf_timeseries',index.available_etf_days]];
  const valid=groups.flatMap(([,days])=>(Array.isArray(days)?days:[]).filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(x))),latest=valid.sort().at(-1);if(!latest)throw Error('Public_Data 索引沒有有效行情日期');
  const end=new Date(`${latest}T00:00:00Z`),cutoffDate=new Date(end);cutoffDate.setUTCDate(cutoffDate.getUTCDate()-30);const cutoff=cutoffDate.toISOString().slice(0,10),paths=new Set();
  for(const [root,days]of groups)for(const day of Array.isArray(days)?days:[])if(/^\d{4}-\d{2}-\d{2}$/.test(day)&&day>=cutoff&&day<=latest)paths.add(`${root}/${day}.json`);
  for(const week of Array.isArray(index.available_weeks)?index.available_weeks:[]){const span=isoWeekBounds(week);if(span&&span.end>=cutoffDate&&span.start<=end)paths.add(`weekly/${week}.json`);}
  const list=[...paths].sort();if(!list.length||list.length>160)throw Error(`索引日期範圍異常：${list.length} 檔，已停止下載`);
  if(statusNode)statusNode.textContent=`準備下載 ${cutoff}～${latest}，共 ${list.length} 檔`;
  let cursor=0;const worker=async()=>{while(cursor<list.length){const path=list[cursor++];try{await publicData(path);succeeded++;if('caches'in window){try{const url=new URL(`../../data/${path}`,location.href).href,c=await caches.open('twstock-rebuild-v1');if(await c.match(url))persisted++;}catch{}}}catch(error){failures.push(`${path}（${error.message}）`);}completed++;if(statusNode)statusNode.textContent=`下載進度 ${completed}/${list.length}・成功 ${succeeded}・瀏覽器離線快取 ${persisted} 檔・失敗 ${failures.length} 檔`;}};
  await Promise.all(Array.from({length:Math.min(4,list.length)},worker));
  if(statusNode)statusNode.textContent=`${cutoff}～${latest}：完成 ${succeeded}/${list.length} 檔，瀏覽器離線快取確認 ${persisted} 檔，失敗 ${failures.length} 檔${failures.length?`；${failures.slice(0,3).join('、')}`:''}`;
 }catch(error){if(statusNode)statusNode.textContent=`下載中止：${error.message}`;}
 finally{button.dataset.busy='0';button.disabled=false;}
}
async function loadMarket(){
  state.index=await publicData('index.json');
  const indexDay=state.index.latest_daily_tw_indices,indexDays=(state.index.available_days_tw_indices??[]).filter(day=>/^\d{4}-\d{2}-\d{2}$/.test(day)&&day<indexDay).sort(),previousIndexDay=indexDays.at(-1);
  const usIndexDay=state.index.latest_daily_us,usIndexDays=(state.index.available_days_us??[]).filter(day=>/^\d{4}-\d{2}-\d{2}$/.test(day)&&day<usIndexDay).sort(),previousUSIndexDay=usIndexDays.at(-1);
  const dailyDay=state.index.latest_daily_tw,dailyDays=(state.index.available_days_tw??[]).filter(day=>/^\d{4}-\d{2}-\d{2}$/.test(day)&&day<dailyDay).sort(),previousDailyDay=dailyDays.at(-1);
  const [metadata,daily,indices,previousIndices,previousDaily,usIndices,previousUSIndices]=await Promise.all([publicData('meta/stocks.json'),publicData(`daily/tw/${dailyDay}.json`),publicData(`daily/tw_indices/${indexDay}.json`),previousIndexDay?publicData(`daily/tw_indices/${previousIndexDay}.json`).catch(()=>null):Promise.resolve(null),previousDailyDay?publicData(`daily/tw/${previousDailyDay}.json`).catch(()=>null):Promise.resolve(null),usIndexDay?publicData(`daily/us/${usIndexDay}.json`).catch(()=>null):Promise.resolve(null),previousUSIndexDay?publicData(`daily/us/${previousUSIndexDay}.json`).catch(()=>null):Promise.resolve(null)]);
  let references=null,referenceIssue='';
  try{references=await publicData('rebuild/price-references.json');if(!validPriceReferenceContract(references,dailyDay,taipeiDay())){references=null;referenceIssue='官方漲跌參考快照日期或契約不符';}}
  catch{referenceIssue='官方漲跌參考快照暫不可用';}
  const byID=new Map((metadata.stocks??[]).map(x=>[x.symbol,x]));state.stockMetadata=byID;let rawCloseChanges=0;
  state.rows=(daily.stocks??[]).filter(r=>resolveListingStatus(r.id,taipeiDay(),state.listing).eligible).map(r=>{
    const enriched=withPriceReference(r,references,daily.date??dailyDay),base=rawRow(enriched,byID.get(r.id),state.listing.stocks[r.id],daily.date??dailyDay);
    const quote=withPreviousRawClose(base,daily,previousDaily,dailyDay,previousDailyDay);
    if(quote!==base&&quote.referenceDate===previousDailyDay)rawCloseChanges++;
    return quote;
  });
  state.marketTurnover=verifiedMarketTurnover(daily,dailyDay);
  if(referenceIssue)state.error=rawCloseChanges?`${referenceIssue}；漲跌以相鄰交易日 raw close 計算，漲跌停價格帶仍顯示資料不足。`:`${referenceIssue}；漲跌及漲跌停狀態顯示資料不足。`;
  const priorClose=new Map((previousIndices?.stocks??[]).filter(r=>Number.isFinite(r.c)&&r.c>0).map(r=>[r.id,r.c]));
  const twIndices=(indices.stocks??[]).map(r=>{const previous=priorClose.get(r.id),change=Number.isFinite(r.c)&&Number.isFinite(previous)?r.c-previous:null;return {...rawRow(r,{},null,indexDay),change,changePercent:change!==null&&previous>0?change/previous*100:null,referencePrice:previous,name:{IX0001:'加權指數',IX0043:'櫃買指數'}[r.id]??r.id,market:'TW'};});
  const usRows=canonicalUSIndexRows(usIndices,previousUSIndices,usIndexDay);
  state.indices=[...twIndices,...usRows];
  state.loaded=true;if(!state.rows.length&&state.listing?.cutoff!==taipeiDay())state.error=LISTING_EXPIRY_MESSAGE;
}
function favoriteButton(symbol,name,identifier=''){
 const saved=Object.values(favorites()).some(items=>items.includes(symbol));
 return `<button type="button" class="star" data-action="favorite" data-symbol="${e(symbol)}" aria-label="${saved?'從所有自選分類移除':'加入預設自選分類'} ${e(name)} ${e(symbol)}" aria-pressed="${saved}"${identifier?` data-favorite-id="${e(identifier)}"`:''}>${saved?'★':'☆'}</button>`;
}
function rowList(rows,context,presentation='default'){
  const p=pref(context),sorted=sortRows(rows,p).map(row=>{
    const symbol=String(row?.symbol??row?.stock_id??'').trim()||'資料不足';
    const quote=state.rows.find(item=>item.symbol===symbol);
    return {...row,...identity(symbol,row,quote,state.stockMetadata?.get(symbol),state.listing?.stocks?.[symbol])};
  }),saved=new Set(Object.values(favorites()).flat());
  const title=id=>d06FieldTitle(id,field(id).title,presentation),value=(row,id)=>d06FieldValue(row,id,format(row,id),presentation);
  const toolbar=['search','watchlist'].includes(context)?'':`<div class="list-head"><small>${rows.length} 檔</small><select aria-label="排序欄位" data-sort="${e(context)}">${state.contract.fields.map(f=>`<option value="${f.id}" ${!p.manual&&p.sort===f.id?'selected':''}>${e(f.title)}</option>`).join('')}</select><button data-action="reverse" data-context="${e(context)}" aria-label="切換排序方向">${p.descending?'↓':'↑'}</button><button data-action="fields" data-context="${e(context)}" aria-label="欄位增減與排序">☷</button></div>`;
  if(!rows.length)return`<section class="stock-section stack">${toolbar}${status('尚無股票資料','加入自選或調整搜尋條件；資料載入後會顯示在這裡。')}</section>`;
  const listFields=context==='search'?['price','changePercent']:p.fields;
  const cards=sorted.map(r=>context==='search'?`<article class="search-result-row"><a class="search-result-link" data-stock="${e(r.symbol)}" href="#/${securityTarget(r.symbol)}?symbol=${encodeURIComponent(r.symbol)}" aria-label="${e(stockSummary(r))}，開啟詳情"><span class="search-result-identity"><span><strong>${e(r.name)}</strong> <small>${e(r.symbol)}</small></span><small>${e(r.sector||'產業資料不足')}</small></span><span class="search-result-quote"><strong>${value(r,'price')}</strong><b class="${movement(r.changePercent)}">${value(r,'changePercent')}</b></span></a><button class="star" data-action="favorite" data-symbol="${e(r.symbol)}" aria-label="${saved.has(r.symbol)?'從所有自選分類移除':'加入預設自選分類'} ${e(r.name)} ${e(r.symbol)}" aria-pressed="${saved.has(r.symbol)}">${saved.has(r.symbol)?'★':'☆'}</button></article>`:context==='watchlist'?`<article class="watchlist-stock-row"><a class="watchlist-stock-link" data-stock="${e(r.symbol)}" href="#/${securityTarget(r.symbol)}?symbol=${encodeURIComponent(r.symbol)}" aria-label="${e(stockSummary(r))}，開啟詳情"><span class="watchlist-stock-head"><span class="watchlist-stock-identity"><strong>${e(r.name)}</strong><small>${e(r.symbol)}</small></span><span class="watchlist-stock-quote"><strong>${value(r,'price')}</strong><b class="${movement(r.changePercent)}">${value(r,'changePercent')}</b></span></span><span class="watchlist-stock-metrics">${p.fields.filter(f=>f!=='price'&&f!=='changePercent').map(f=>`<span><small>${e(title(f))}</small><b>${value(r,f)}</b></span>`).join('')}</span></a><button class="star" data-action="favorite" data-symbol="${e(r.symbol)}" aria-label="${saved.has(r.symbol)?'從所有自選分類移除':'加入預設自選分類'} ${e(r.name)} ${e(r.symbol)}" aria-pressed="${saved.has(r.symbol)}">${saved.has(r.symbol)?'★':'☆'}</button></article>`:`<article class="row"><a class="row-link" data-stock="${e(r.symbol)}" href="#/${securityTarget(r.symbol)}?symbol=${encodeURIComponent(r.symbol)}" aria-label="${e(stockSummary(r))}，開啟詳情"><div class="identity"><strong>${e(r.name)}</strong><span>${e(r.symbol)}</span></div><div class="row-fields">${p.fields.map(f=>`<div><small>${e(title(f))}</small><span class="value ${f==='changePercent'?movement(r.changePercent):f==='pnl'?profitLossClass(r.pnl):''}">${value(r,f)}</span></div>`).join('')}</div></a><button class="star" data-action="favorite" data-symbol="${e(r.symbol)}" aria-label="${saved.has(r.symbol)?'從所有自選分類移除':'加入預設自選分類'} ${e(r.name)} ${e(r.symbol)}" aria-pressed="${saved.has(r.symbol)}">${saved.has(r.symbol)?'★':'☆'}</button></article>`).join('');
  const columns=['identity',...listFields];
  const table=`<div class="stock-table ${context==='search'?'search-stock-table':''}">${context==='search'?'':`<div class="toolbar"><button data-column-reset="${e(context)}">重設欄寬</button><small data-width-status role="status">拖曳欄位邊界或使用方向鍵調整寬度。</small></div>`}<table data-width-context="${e(context)}" style="table-layout:fixed;width:${columns.reduce((sum,f)=>sum+columnWidth(context,f),72)}px"><colgroup>${columns.map(f=>`<col data-width-field="${e(f)}" style="width:${columnWidth(context,f)}px">`).join('')}<col style="width:72px"></colgroup><thead><tr><th scope="col">名稱／代號${context==='search'?'':columnHandle(context,'identity','名稱／代號')}</th>${listFields.map(f=>`<th scope="col" aria-sort="${!p.manual&&p.sort===f?(p.descending?'descending':'ascending'):'none'}" draggable="${context!=='search'}" data-drag-field="${e(f)}" data-context="${e(context)}">${context==='search'?e(title(f)):`<button data-action="sort-field" data-field="${e(f)}" data-context="${e(context)}">${e(title(f))}</button>${columnHandle(context,f,field(f).title)}`}</th>`).join('')}<th>自選</th></tr></thead><tbody>${sorted.map(r=>`<tr tabindex="0" data-row-stock="${e(r.symbol)}" aria-label="${e(stockSummary(r))}；Enter 開啟完整詳情，空白鍵依偏好開啟"><td><a data-stock="${e(r.symbol)}" href="#/${securityTarget(r.symbol)}?symbol=${encodeURIComponent(r.symbol)}"><strong>${e(r.name)}</strong><br><small>${e(r.symbol)}</small></a></td>${listFields.map(f=>`<td class="${f==='changePercent'?movement(r.changePercent):f==='pnl'?profitLossClass(r.pnl):''}" data-select-stock="${e(r.symbol)}">${value(r,f)}</td>`).join('')}<td><button class="star" data-action="favorite" data-symbol="${e(r.symbol)}" aria-label="${saved.has(r.symbol)?'從所有自選分類移除':'加入預設自選分類'} ${e(r.name)} ${e(r.symbol)}" aria-pressed="${saved.has(r.symbol)}">${saved.has(r.symbol)?'★':'☆'}</button></td></tr>`).join('')}</tbody></table></div>`;
  const pageSize=10,paged=sorted.length>pageSize?` data-list-paged data-list-total="${sorted.length}" data-list-size="${pageSize}" data-list-page="0"`:'';const more=sorted.length>pageSize?`<div class="mobile-list-pagination" data-list-pagination><button type="button" data-action="list-page-prev" disabled>上一頁</button><span role="status">第 1 頁・1–${pageSize}／${sorted.length} 檔</span><button type="button" data-action="list-page-next">下十檔</button></div>`:'';
  return`<section class="stock-section stack"><div class="rows"${paged}>${toolbar}${cards}${more}</div>${table}</section>`;
}
function chooseRows(){const all=favorites(),symbols=[...new Set(state.group==='all'?Object.values(all).flat():(all[state.group]??[]))],rows=new Map(state.rows.map(r=>[r.symbol,r]));return symbols.map(symbol=>rows.get(symbol)).filter(Boolean);}
function searchDirectory(){return searchDirectoryRows(state.rows,state.stockMetadata,state.listing,taipeiDay());}
function setListPage(host,page){
 const size=Number(host.dataset.listSize)||10,total=Number(host.dataset.listTotal)||0,max=Math.max(0,Math.ceil(total/size)-1);
 page=Math.max(0,Math.min(max,page));host.dataset.listPage=String(page);
 host.querySelectorAll('.row,.search-result-row,.watchlist-stock-row').forEach((row,index)=>{row.style.display=index>=page*size&&index<(page+1)*size?'':'none';});
 const pager=host.querySelector('[data-list-pagination]');if(!pager)return;
 const prev=pager.querySelector('[data-action="list-page-prev"]'),next=pager.querySelector('[data-action="list-page-next"]');
 if(prev)prev.disabled=page===0;if(next)next.disabled=page===max;
 const label=pager.querySelector('span');if(label)label.textContent=`第 ${page+1} 頁・${page*size+1}–${Math.min((page+1)*size,total)}／${total} 檔`;
}
function mountMobileCardPagination(root){
 if(matchMedia('(min-width:1100px)').matches)return;
 const parents=[root,...root.querySelectorAll('*')];
 for(const parent of parents){
  if(parent.closest('[data-mobile-page]'))continue;
  const cards=[...parent.children].filter(node=>node.matches('.card')),denseEvidence=parent===root&&root.dataset.route==='valuation-evidence';if(cards.length<=(denseEvidence?5:10))continue;
  const pageSize=10;parent.dataset.mobilePage='true';parent.dataset.mobileSize=String(pageSize);parent.dataset.mobilePageNumber='0';parent.dataset.mobileTotal=String(cards.length);cards.forEach((node,index)=>{if(index>=pageSize)node.style.display='none';});
  parent.dataset.mobilePageNumber='0';
  const controls=document.createElement('div');controls.className='mobile-list-pagination mobile-page-pagination';controls.innerHTML=`<button type="button" data-action="mobile-page-prev" disabled>上一頁</button><span role="status">第 1 頁・1–${Math.min(pageSize,cards.length)}／${cards.length} 項</span><button type="button" data-action="mobile-page-next" ${cards.length<=pageSize?'disabled':''}>下十檔</button>`;parent.append(controls);
 }
}

function groupLabel(key){let names={};try{const raw=localStorage.getItem('rebuild.watchlist.names.v1');if(raw){const parsed=JSON.parse(raw);if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))names=parsed;}}catch{}return typeof names[key]==='string'&&names[key].trim()?names[key]:key==='cat1'?'我的最愛':key;}
function watchlistControls(){const groups=favorites(),items=Object.entries(groups),all=[...new Set(items.flatMap(([,symbols])=>symbols))],selected=state.group??'all';const button=(key,label,count)=>`<button type="button" data-action="watch-group" data-group="${e(key)}" aria-pressed="${selected===key}" ${selected===key?'class="primary"':''}>${e(label)} <small>${count}</small></button>`;return `<div class="watchlist-controls"><div class="watchlist-categories" role="group" aria-label="自選分類">${button('all','全部自選',all.length)}${items.map(([key,symbols])=>button(key,groupLabel(key),symbols.length)).join('')}</div></div>`;}
function watchlistOverflow(){const p=pref('watchlist');return `<details class="watchlist-overflow"><summary aria-label="自選選單" title="自選選單">•••</summary><div class="watchlist-overflow-panel"><label>排序<select aria-label="排序欄位" data-sort="watchlist"><option value="manual" ${p.manual?'selected':''}>分類順序</option>${state.contract.fields.map(f=>`<option value="${e(f.id)}" ${!p.manual&&p.sort===f.id?'selected':''}>${e(f.title)}</option>`).join('')}</select></label><button type="button" data-action="reverse" data-context="watchlist" ${p.manual?'disabled':''}>${p.descending?'↓':'↑'}　切換排序方向</button><button type="button" data-action="fields" data-context="watchlist">☷　欄位設定</button><a href="#/groups">管理自選分類</a><a href="#/search">搜尋股票</a></div></details>`;}
function readSearchHistory(){try{const v=JSON.parse(localStorage.getItem('rebuild.search-history.v1')??'[]');return Array.isArray(v)?[...new Set(v.filter(x=>typeof x==='string'&&x.trim()).map(x=>x.trim()))].slice(0,8):[];}catch{return[];}}
function rememberSearch(value){const q=value.trim();if(!q)return;localStorage.setItem('rebuild.search-history.v1',JSON.stringify([q,...readSearchHistory().filter(x=>x!==q)].slice(0,8)));}
function searchPage(){
 const kinds=[['all','全部'],['equity','台股'],['fund','ETF'],['us','美股']];
 const buttons=kinds.map(([key,label])=>`<button type="button" class="search-kind" data-action="search-kind" data-kind="${key}" aria-pressed="${state.searchType===key}">${label}</button>`).join('');
 const history=readSearchHistory();
 const recent=history.length?`<section class="search-recent"><div class="section-heading"><h2>最近搜尋</h2><button type="button" data-action="search-history-clear">清除</button></div><div class="search-history">${history.map(q=>`<button type="button" data-action="search-history" data-query="${e(q)}">◷ ${e(q)}</button>`).join('')}</div></section>`:'';
 const rows=searchDirectory().filter(r=>{const type=state.searchType==='all'||(state.searchType==='fund'&&r.securityType==='fund')||(state.searchType==='equity'&&r.securityType==='equity'&&['TWSE','TPEX'].includes(String(r.market).toUpperCase()))||(state.searchType==='us'&&['US','NASDAQ','NYSE','AMEX'].includes(String(r.market).toUpperCase()));return type&&`${r.name} ${r.symbol}`.toLowerCase().includes(state.query.toLowerCase());});
 const unavailable=state.searchType==='us'&&!rows.length?'<p class="muted" role="status">目前 canonical 行情未提供美股資料；來源接入前不以台股結果代替。</p>':'';
 return `<label class="search-input">搜尋股票<input id="stock-search" type="search" value="${e(state.query)}" placeholder="輸入股票名稱或代號" autocomplete="off"></label><div class="search-kinds" role="group" aria-label="搜尋證券類型">${buttons}</div>${recent}<section class="search-results"><h2>${state.query?'搜尋結果':'熱門搜尋'}</h2>${unavailable}${rowList(rows,'search')}</section>`;
}
function groupsPage(){const entries=Object.entries(favorites());return card('',`<p class="muted">編輯自選分類；使用右側把手調整順序。鍵盤可聚焦分類列後以上移／下移操作。</p><div class="group-management-list" role="list">${entries.map(([key,items],i)=>`<div class="group-management-row" role="listitem" draggable="true" data-drag-group="${e(key)}"><button data-action="group-members" data-group="${e(key)}" aria-label="${e(groupLabel(key))}，${items.length} 檔，管理成員"><span class="group-dot" data-group-index="${i%8}" aria-hidden="true"></span><span class="group-row-label">${e(groupLabel(key))}</span><small>${items.length} 檔</small><span class="group-chevron" aria-hidden="true">›</span></button><span class="group-drag-handle" aria-hidden="true">≡</span><button class="group-order-control" data-action="group-up" data-group="${e(key)}" aria-label="${e(groupLabel(key))} 分類上移" ${i===0?'disabled':''}>上移</button><button class="group-order-control" data-action="group-down" data-group="${e(key)}" aria-label="${e(groupLabel(key))} 分類下移" ${i===entries.length-1?'disabled':''}>下移</button></div>`).join('')}</div><details class="group-add"><summary>＋ 新增分類</summary><form id="add-group" class="stack"><label>分類名稱<input name="name" required maxlength="80" placeholder="例如：觀察中"></label><button class="primary">新增分類</button></form></details>`);}
function groupMemberSuggestions(key,query){
 const text=String(query??'').trim();if(!text)return '<p class="muted">輸入股票名稱或代號，從 Public_Data 名冊選擇。</p>';
 const result=favoriteSearchCandidates(searchDirectory(),text,favorites()[key]??[]);
 if(!result.total)return '<p class="muted" role="status">沒有符合目前 Public_Data 股票名冊的結果。</p>';
 const rows=result.rows.map(row=>'<div class="group-member-suggestion" role="listitem"><a href="#/'+securityTarget(row.symbol)+'?symbol='+encodeURIComponent(row.symbol)+'" aria-label="查看個股 '+e(row.name)+' '+e(row.symbol)+'"><strong>'+e(row.name)+'</strong><small>'+e(row.symbol)+'</small></a><button class="star" type="button" data-action="group-member-add" data-group="'+e(key)+'" data-symbol="'+e(row.symbol)+'" aria-label="加入自選分類 '+e(groupLabel(key))+'：'+e(row.name)+' '+e(row.symbol)+'" aria-pressed="false">☆</button></div>').join('');
 return '<section class="group-member-suggestions" aria-live="polite"><h3>搜尋結果・'+result.total+' 檔</h3><div role="list">'+rows+'</div>'+(result.total>result.rows.length?'<p class="muted">共 '+result.total+' 筆，顯示前 '+result.rows.length+' 筆。請縮小搜尋範圍。</p>':'')+'</section>';
}
function groupMembers(key,query=''){
 const groups=favorites(),items=groups[key]??[],directory=searchDirectory();
 const memberRows=items.map((symbol,i)=>{const row=directory.find(r=>r.symbol===symbol)??identity(symbol,state.listing?.stocks?.[symbol]);return '<section class="card"><div class="toolbar"><a class="grow" href="#/'+securityTarget(symbol)+'?symbol='+encodeURIComponent(symbol)+'">'+e(row.name)+' '+e(symbol)+'</a>'+favoriteButton(symbol,row.name,'group-member-'+key+'-'+symbol)+'</div><div class="toolbar"><button data-action="member-up" data-group="'+e(key)+'" data-symbol="'+e(symbol)+'" aria-label="'+e(row.name)+' '+e(symbol)+' 上移" '+(i===0?'disabled':'')+'>↑</button><button data-action="member-down" data-group="'+e(key)+'" data-symbol="'+e(symbol)+'" aria-label="'+e(row.name)+' '+e(symbol)+' 下移" '+(i===items.length-1?'disabled':'')+'>↓</button><button data-action="member-remove" data-group="'+e(key)+'" data-symbol="'+e(symbol)+'">移除此成員</button></div><label>移至分類<select data-member-move="'+e(symbol)+'" data-group="'+e(key)+'"><option value="">選擇目的分類</option>'+Object.keys(groups).filter(x=>x!==key).map(x=>'<option value="'+e(x)+'">'+e(groupLabel(x))+'</option>').join('')+'</select></label></section>';}).join('');
 return '<div class="toolbar"><h2 class="grow" data-group-management="'+e(key)+'">'+e(groupLabel(key))+' · 成員管理</h2><button data-action="close-fields">完成</button></div><p class="muted">調整順序、移至另一分類，或從此分類移除。股票行情仍可由搜尋開啟。</p><div class="stack">'+(memberRows||'<p class="muted">此分類尚無成員。</p>')+'</div><form id="group-add-member" data-group="'+e(key)+'" class="stack"><label>加入股票名稱或代號<input id="group-member-query" name="symbol" value="'+e(query)+'" required autocomplete="off" placeholder="輸入名稱或代號，自動顯示股票建議" aria-controls="group-member-suggestions"></label><div id="group-member-suggestions">'+groupMemberSuggestions(key,query)+'</div><p role="status" aria-live="polite"></p></form>';
}
function openGroup(key){document.querySelector('dialog')?.remove();const d=document.createElement('dialog');d.dataset.group=key;d.innerHTML=groupMembers(key);app.append(d);d.showModal();}
function fieldsEditor(context,inline=false,layout='default'){
 const p=pref(context);
 if(layout==='d06'){
  const selected=p.fields.filter(id=>D06_FIELDS.includes(id)),ordered=[...selected,...D06_FIELDS.filter(id=>!selected.includes(id))];
  return `<div class="d06-field-editor"><h3>選擇欄位</h3><p class="muted">選擇要在個股列表中顯示的欄位，並拖曳調整順序。股票名稱與代號固定顯示。</p><p class="d06-field-count" role="status">已選 ${1+selected.length} / 12</p><div class="d06-field-list"><div class="d06-field-option d06-field-locked"><input type="checkbox" checked disabled aria-label="股票名稱與代號固定顯示"><span>股票（名稱＋代號）</span><span class="d06-field-lock" aria-hidden="true">▣</span></div>${ordered.map(id=>`<label class="d06-field-option" draggable="true" data-drag-field="${e(id)}" data-context="${e(context)}"><input type="checkbox" data-action="toggle-display-field" data-context="${e(context)}" data-field="${e(id)}" ${selected.includes(id)?'checked':''} aria-label="顯示${e(d06FieldTitle(id,field(id).title,'d06'))}"><span>${e(d06FieldTitle(id,field(id).title,'d06'))}</span><span class="d06-field-handle" aria-hidden="true">⠿</span></label>`).join('')}</div><button type="button" data-action="reset-fields" data-context="${e(context)}">還原預設欄位</button></div>`;
 }
 return`<div class="stack"><div class="toolbar"><h2 class="grow">欄位設定</h2>${inline?'':'<button data-action="close-fields">完成</button>'}</div><p class="muted">名稱與代號固定顯示；拖拉欄位或使用上移／下移。</p><div>${p.fields.map((f,i)=>`<div class="editor-row" draggable="true" data-drag-field="${e(f)}" data-context="${e(context)}"><span>${e(field(f).title)}</span><button data-action="move-field" data-context="${e(context)}" data-field="${e(f)}" data-offset="-1" aria-label="上移${e(field(f).title)}" ${i===0?'disabled':''}>↑</button><button data-action="move-field" data-context="${e(context)}" data-field="${e(f)}" data-offset="1" aria-label="下移${e(field(f).title)}" ${i===p.fields.length-1?'disabled':''}>↓</button><button class="visibility" data-action="hide-field" data-context="${e(context)}" data-field="${e(f)}" aria-label="隱藏${e(field(f).title)}">−</button></div>`).join('')}</div><h3>新增欄位</h3><div class="toolbar">${state.contract.fields.filter(f=>!p.fields.includes(f.id)).map(f=>`<button data-action="add-field" data-context="${e(context)}" data-field="${e(f.id)}">＋ ${e(f.title)}</button>`).join('')}</div><button data-action="reset-fields" data-context="${e(context)}">還原預設欄位</button></div>`;
}
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
function interactiveChart(points,row,options={}){const token=String(++chartToken);chartPending.set(token,{points,row,options});return card(`${row.name} ${row.symbol}・原始 K 線`,`<div data-interactive-chart="${token}"></div>`);}
function mountCharts(root){root.querySelectorAll('[data-interactive-chart]').forEach(el=>{const data=chartPending.get(el.dataset.interactiveChart);if(data){const compare=document.createElement('section');compare.className='stack';el.after(compare);mountComparison(compare,el,`${data.row.name} ${data.row.symbol}`,{state,publicData,favoriteButton});mountChart(el,data.points.map(p=>({...p,date:new Date(p.time*1000).toISOString().slice(0,10)})),`${data.row.name} ${data.row.symbol}`,compare,data.options);chartPending.delete(el.dataset.interactiveChart);}});}
function securityNavigation(symbol,active,isETF){
 const healthView=active==='health'||new URLSearchParams(location.hash.split('?')[1]??'').get('view')==='health';
 const {ids,tabs,current}=securityNavigationForRoute(active,{isETF,healthView});
 const suffix=healthView?'&view=health':'';
 const tabLinks=tabs.map(([id,label])=>`<a href="#/${id}?symbol=${encodeURIComponent(symbol)}${suffix}" ${id===current?'aria-current="page"':''}>${label}</a>`).join('');
 const extraActive=!tabs.some(([id])=>id===current),all=ids.map(id=>`<a href="#/${id}?symbol=${encodeURIComponent(symbol)}${suffix}" ${id===active?'aria-current="page"':''}>${e(title(id))}</a>`).join('');
 return`<nav class="detail-sections" aria-label="個股詳情分區">${tabLinks}<details class="detail-all" ${extraActive?'data-current="page"':''}><summary aria-label="全部詳情分區">全部</summary><div class="detail-all-menu">${all}</div></details></nav>`;
}
function securityChartModes(symbol,active){
 const links=[['intraday','分時'],['candles','K 線']].map(([id,label])=>`<a href="#/${id}?symbol=${encodeURIComponent(symbol)}"${active===id?' aria-current="page"':''}>${label}</a>`).join('');
 return `<nav class="detail-chart-modes" aria-label="圖表模式">${links}</nav>`;
}
async function security(id,symbol){
  const darkPreview=['dark-security','dark-etf'].includes(id);
  id=({'dark-security':'security','dark-etf':'etf'})[id]??id;
  if(id==='security'&&symbol)id=securityTarget(symbol);
  if(!symbol)return status('請先選擇證券','由股票列表開啟個股或ETF，即可查看此分區。','⌕')+card('',link('search'));
  let row=state.rows.find(r=>r.symbol===symbol)??{...identity(symbol,state.stockMetadata?.get(symbol),state.listing?.stocks?.[symbol])};
  const allowed=resolveListingStatus(symbol,taipeiDay(),state.listing).eligible;
  const provisionalEligible=allowed&&['TWSE','TPEX'].includes(row.market)&&row.securityType!=='fund'&&['security','candles'].includes(id)&&String(row.asOf??'').slice(0,10)!==taipeiDay();
  const provisionalCandle=provisionalEligible?await modules.provisionalCandle(symbol,row):null;
  if(provisionalCandle)row={...row,price:provisionalCandle.close,open:provisionalCandle.open,high:provisionalCandle.high,low:provisionalCandle.low,volume:provisionalCandle.volume,change:null,changePercent:null,referencePrice:null,asOf:provisionalCandle.date,quoteSource:provisionalCandle.provider};
  const isSaved=Object.values(favorites()).some(items=>items.includes(symbol));
  const liveBand=allowed&&['security','etf'].includes(id)?await modules.priceBand(symbol,row):null;
  const sourceBand=String(row.asOf??'').slice(0,10)===taipeiDay()&&[row.referencePrice,row.limitUp,row.limitDown].every(Number.isFinite)&&row.referencePrice>0&&row.limitUp>row.referencePrice&&row.limitDown>0&&row.limitDown<row.referencePrice;
  const limit=liveBand?.label??(allowed&&sourceBand?limitStatus(row):null),bandKnown=Boolean(liveBand?.valid||sourceBand);
  const limitHint=liveBand?.unlimited?(liveBand.unlimitedKind==='etf'?'<small class="muted">依官方基金類型・無漲跌幅限制</small>':'<small class="muted">上市首日・無漲跌幅限制</small>'):limit?`<span class="pill ${limit==='漲停'?'limit-up':'limit-down'}" aria-label="${limit}">${limit==='漲停'?'▲':'▼'} ${limit}</span>`:bandKnown?'<small class="muted">尚未觸及當日漲跌停價格</small>':'<small class="muted">漲跌停狀態：來源未提供完整價格帶，暫不判定</small>';
  const tradeActions=darkPreview?`<div class="security-trade-dock" aria-label="新增本機交易紀錄"><a href="#/new-trade?symbol=${encodeURIComponent(symbol)}&side=${encodeURIComponent('賣出')}">賣出</a><a class="primary" href="#/new-trade?symbol=${encodeURIComponent(symbol)}&side=${encodeURIComponent('買入')}">買進</a></div>`:'';
  const desktopSecurityOverview=matchMedia('(min-width:1100px)').matches&&['security','etf'].includes(id);
  const isETFDetail=row.securityType==='fund'||['etf','constituents','rebalance','etf-performance','fund','bond'].includes(id);
  const makeTop=(displayRow=row)=>{
    const heading=`<h2>${e(displayRow.name)} <small>${e(symbol)}</small></h2><button data-action="favorite" data-symbol="${e(symbol)}" aria-pressed="${isSaved}" aria-label="${isSaved?'從所有自選分類移除':'加入預設自選分類'} ${e(displayRow.name)} ${e(symbol)}">${isSaved?'★ 已加入自選':'☆ 加入自選'}</button>`;
    const marketBadge=displayRow.market==='TWSE'?'上市':displayRow.market==='TPEX'?'上櫃':displayRow.market||'市場資料不足';
    const identityTags=`<div class="security-identity-tags"><span>${e(marketBadge)}</span><span>${e(displayRow.industry||displayRow.sector||'產業資料不足')}</span><span>指數成分・資料不足</span></div>`;
    const desktopQuote=allowed?`<div class="hero-value ${movement(displayRow.changePercent)}">${number(displayRow.price)}</div><p class="${movement(displayRow.changePercent)}">漲跌 ${format(displayRow,'change')}・${format(displayRow,'changePercent')}</p><p>成交量 ${format(displayRow,'volume')}</p><small>${displayRow.quoteSource?`${e(displayRow.quoteSource)}・當日暫行行情${displayRow.quoteSource==='Yahoo Finance'?'・可能延遲 15 分鐘，非即時':''}`:`原始市場價格・${e(displayRow.asOf??'尚未同步')}`}</small>${limitHint}`:desktopSecurityOverview?'<strong class="hero-value muted">資料不足</strong><p>上市資格尚未確認・暫停顯示市場報價</p><small>Public_Data 資格 sidecar 未通過</small>':'<p>上市狀態尚未確認或不符合目前市場資格；僅保留個人歷史紀錄。</p>';
    const reference=Number.isFinite(displayRow.price)&&Number.isFinite(displayRow.change)?number(displayRow.price-displayRow.change):'資料不足';
    const movementLabel=Number.isFinite(displayRow.change)?`${displayRow.change>0?'▲ ':displayRow.change<0?'▼ ':''}${displayRow.change>0?'+':''}${number(displayRow.change)}（${format(displayRow,'changePercent')}）`:'資料不足';
    const mobileQuote=allowed?`<div class="hero-value ${movement(displayRow.changePercent)}">${number(displayRow.price)}</div><p class="${movement(displayRow.changePercent)}">參考價 ${reference}・${movementLabel}</p><small>${displayRow.quoteSource?`${e(displayRow.quoteSource)}・當日暫行行情${displayRow.quoteSource==='Yahoo Finance'?'・可能延遲 15 分鐘，非即時':''}`:`原始市場價格・${e(displayRow.asOf??'尚未同步')}`}</small>${limitHint}`:'<p>上市狀態尚未確認或不符合目前市場資格；僅保留個人歷史紀錄。</p>';
    const keyMetrics=`<div class="desktop-security-key-stats">${['open','high','low','volume','sector','market'].map((k,i)=>metric(['開盤','最高','最低','成交量','產業','市場'][i],typeof row[k]==='string'?e(row[k]||'資料不足'):number(row[k]))).join('')}</div>`,unavailableKeyMetrics=`<div class="desktop-security-key-stats">${['開盤','最高','最低','成交量','產業','市場'].map(label=>metric(label,'資料不足')).join('')}</div>`;
    const body=desktopSecurityOverview?`<div class="desktop-security-quote"><div class="desktop-security-quote-heading">${heading}</div><div class="desktop-security-quote-price">${desktopQuote}</div>${allowed?keyMetrics:unavailableKeyMetrics}</div>`:`${heading}${identityTags}${mobileQuote}`;
    return securityNavigation(symbol,id,isETFDetail)+card('',body);
  };
  const top=makeTop();
  let sharesOutstanding=Number.isFinite(state.stockMetadata?.get(symbol)?.shares_outstanding)?state.stockMetadata.get(symbol).shares_outstanding:null;
  let sharesOutstandingDate=sharesOutstanding===null?null:'metadata 日期未提供';
  if(id==='security'&&!desktopSecurityOverview){
    try{
      const fundamentals=await publicData(`fundamentals/${encodeURIComponent(symbol)}.json`),shares=fundamentals?.balance_sheet?.shares_outstanding;
      if(fundamentals?.stock_id===symbol&&Number.isFinite(shares)&&shares>0){sharesOutstanding=shares;sharesOutstandingDate=fundamentals.as_of??'資料日期不足';}
    }catch{}
  }
  if(id==='records')return top+await personalRecords.page({symbol,name:row.name,price:row.price,asOf:row.asOf,eligible:allowed})+transactions(symbol);
  if(matchMedia('(min-width:1100px)').matches&&['etf','constituents','rebalance','etf-performance','fund','bond'].includes(id))return await modules.detail('constituents',symbol,row);
  if(!allowed&&detailRouteRequiresListingEligibility(id)){if(desktopSecurityOverview&&id==='security')return top+desktopSecurityUnavailableContent({name:row.name,symbol});return top+status('目前市場資料不可用','待確認上市狀態後才能載入行情與分析。','◇')+tradeActions;}
  if(['security','etf','candles','intraday'].includes(id)){
    let etfOverview='';
    if(id==='etf'&&row.securityType==='fund'){
      try {
        const snapshots=await publicData('quant/etf/outputs/latest_snapshot.json'),fund=snapshots[symbol];
        if(fund){const disclosure=fundDisclosure(fund);etfOverview=card('ETF 基本資料',`<div class="metric-grid">${metric('基金分類',e(fund.category??'資料不足'))}${metric('商品類型',e(fund.type??'資料不足'))}${metric('基金資料日期',e(fundSnapshotDate(fund)??'來源日期不足'))}${metric('成分揭露日期',e(disclosure.date??'來源未提供'))}${metric('來源成分檔數',String(fund.holdings?.length??0))}${metric('揭露完整性',disclosure.complete?'來源已附完整證明':'部分揭露或完整性未確認')}</div><p>持倉來源狀態：${e(disclosure.origin)}；來源擷取時間：${e(disclosure.retrievedAt??'未提供')}${disclosure.reusedAt?`；沿用時間：${e(disclosure.reusedAt)}`:''}。</p><p class="muted">基金擷取日期不代表成分揭露日期；權重合計不能單獨證明完整性。詳細資料請查看成分與配置、配息與績效及基金資訊分區。</p>`);}
        else etfOverview=status('ETF 基本資料不足','來源尚未提供此基金的成分快照。');
      } catch(error) { etfOverview=status('ETF 基本資料暫不可用',error.message,'↗',true); }
    }
    const makeSummary=(topContent=top,displayRow=row)=>topContent+etfOverview+(['security','etf'].includes(id)&&!desktopSecurityOverview?card('關鍵數據',`<div class="metric-grid">${[
      ['開盤',number(displayRow.open)],['最高',number(displayRow.high)],['最低',number(displayRow.low)],
      ['昨收',Number.isFinite(displayRow.price)&&Number.isFinite(displayRow.change)?number(displayRow.price-displayRow.change):'資料不足'],
      ['成交量',Number.isFinite(displayRow.volume)?`${number(displayRow.volume/1000,0)} 張`:'資料不足'],['成交金額',Number.isFinite(displayRow.turnover)?`${number(displayRow.turnover/100000000)} 億元`:'資料不足'],
      ['本益比',number(displayRow.pe)],['殖利率',Number.isFinite(displayRow.yield)?`${number(displayRow.yield)}%`:'資料不足'],
      ['市值',Number.isFinite(displayRow.marketCap)?`${number(displayRow.marketCap/1000000000000)} 兆`:'資料不足'],
      ['流通股數',Number.isFinite(sharesOutstanding)?`${number(sharesOutstanding/100000000)} 億股`:'資料不足']
    ].map(([label,value])=>metric(label,value)).join('')}</div><p class="muted">流通股數來源：Public_Data・${e(sharesOutstandingDate??'資料日期不足')}。未提供的 PE／殖利率／市值欄位維持資料不足。</p>`):'');
    if(id==='intraday')return makeSummary()+(isETFDetail?'':securityChartModes(symbol,id))+await modules.intraday(symbol,row);
    const desktopOverview=matchMedia('(min-width:1100px)').matches;
    try {
      const recent=await loadRecentDailyChart(symbol,state.index,publicData),movement=changeFromRecentRawCloses(row,state.index,recent),previous=recent.rows.at(-1)?.close,liveMovement=provisionalCandle&&Number.isFinite(previous)&&previous>0?{change:provisionalCandle.close-previous,changePercent:(provisionalCandle.close-previous)/previous*100}:null,displayRow=liveMovement?{...row,...liveMovement}:movement?{...row,...movement}:row,summary=makeSummary(makeTop(displayRow),displayRow),detail=`Public_Data 最近30日 raw 日 OHLCV・${recent.observedDates.length}/${recent.requestedDates.length} 個交易日${recent.missingDates.length?`・無個股列資料：${recent.missingDates.join('、')}`:''}；未使用 adj_close。`,chartRows=provisionalCandle&&recent.rows.at(-1)?.date<provisionalCandle.date?[...recent.rows,{...provisionalCandle,gapBefore:false}]:recent.rows;
      if(id==='security'&&!desktopOverview){const events=await desktopSecurityEvents(symbol);return summary+card('近期重大事件（Public_Data）',events+link('news','更多重大事件',symbol));}
      const intradayView=desktopOverview?`<div id="desktop-intraday-chart">${await modules.intraday(symbol,row)}</div>`:'';
      return summary+(isETFDetail?'':securityChartModes(symbol,id))+card('原始日線（最近30日）',`<p class="muted">${e(detail)}</p>`)+interactiveChart(chartRows,row,{desktopOverview,symbol,market:row.market})+(provisionalCandle?'<p class="source muted">圖表末端為本日暫行盤中日 K・'+e(provisionalCandle.provider)+(provisionalCandle.provider==='Yahoo Finance'?'・可能延遲 15 分鐘，非即時':'')+'；Public_Data 發布後由 canonical 日線取代。</p>':'')+intradayView+tradeActions;
    } catch(error) {return makeSummary()+status('歷史圖表暫時無法載入',`${error.message}。基本行情仍可查閱，請稍後重試。`,'↗',true)+tradeActions;}
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
    return top+card('揭露狀態',`<p>${e(etf.data_mode??'揭露完整性未知')}・原始權重合計 ${number(total)}%</p><p>${disclosure.complete?'來源已附完整揭露證明':'部分揭露或完整性未確認'}</p><p>成分揭露日期：${e(disclosure.date??'來源未提供')}；成分來源：${e(disclosure.source??'來源未提供')}</p><p>持倉來源狀態：${e(disclosure.origin)}；來源擷取時間：${e(disclosure.retrievedAt??'未提供')}${disclosure.reusedAt?`；沿用時間：${e(disclosure.reusedAt)}`:''}</p><p class="muted">原始權重未正規化成100%，權重合計不代表完整性證明。可列入台股行情 ${rows.length}／來源 ${holdings.length} 筆；未通過台股資格的資產不列入行情，亦不視為不存在。</p>`)+rowList(rows,`constituents.${symbol}`);
  }
  return top+unfinished(id);
}
function transactions(symbol){const trades=state.checkpoint?.trades??[];const selected=trades.filter(r=>!symbol||String(r.symbol??r.stock_id)===symbol);return card('原有交易紀錄',`<p>共 ${selected.length} 筆・唯讀相容讀取</p><p class="muted">原 IndexedDB 名稱、儲存區與所有紀錄保持原狀。</p>`)+(selected.length?selected.map(tx=>{const s=String(tx.symbol??tx.stock_id??'').trim(),rawName=String(tx.name??tx.stockName??'').trim(),stock=identity(s,rawName&&rawName!==s?{name:rawName}:null,state.rows.find(r=>r.symbol===s),state.listing?.stocks?.[s]);return card(`${stock.name} ${stock.symbol}`,`${transactionStockActions(s,stock.name,`transaction-${tx.id??tx.tradeId??s}`,favoriteButton)}<div class="metric-grid">${(tx.type??tx.side)==='配息'?metric('入帳金額（原交易幣別）',number(cashflowRecords([tx]).records[0]?.amount)):metric('歷史成交價',number(tx.price))+metric('成交股數',number(tx.shares??tx.quantity))}${metric('交易日期',e(tx.date??tx.tradeDate??tx.trade_date??'格式待確認'))}${metric('交易類別',e(tx.type??tx.side??'格式待確認'))}</div>${s?link('records','查看個股紀錄',s):''}`);}).join(''):status('尚無交易紀錄','目前瀏覽器尚未保存交易資料。','▤'));}
async function content(id,symbol){
  const item=state.contract.routes.find(r=>r.id===id);
  if(!item)return status('找不到此頁面','請從底部導航重新選擇。');
  if(item.tab==='security'||['dark-security','dark-etf'].includes(id))return security(id,symbol);
  if(id==='heatmap'){const rows=state.rows.filter(r=>resolveListingStatus(r.symbol,taipeiDay(),state.listing).eligible&&r.securityType!=='fund'&&r.sector!=='ETF'&&r.industry!=='ETF'&&Number.isFinite(r.turnover)&&r.turnover>0&&Number.isFinite(r.changePercent));return marketTabs(id)+(rows.length?card('市場熱力圖',`<p class="muted">有效行情成交值前150檔，排除 ETF，優先按產業分組；面積依原始成交值，顏色使用原始市場價格漲跌幅。資料日期：${e(state.index?.latest_daily_tw??'資料日期不足')}。方塊直接顯示股票名稱與代號；點選可開啟個股。選擇產業切換分組。</p><div data-heatmap aria-label="按產業分組的成交值熱力圖"></div>`):status('熱力圖資料不足','需要有效原始成交值與市場參考價；缺少資料時不以還原價格代替。'));}
  if(id==='overview'){const current=route();return marketOverview({state,card,metric,link,rowList,favoriteButton,publicData,marketQuotes:modules.marketQuotes,marketIndexQuotes:modules.marketIndexQuotes},id,current.panel??'taiwan',current.section??'risk',current.category??'margin_pressure_highest',current.symbol,current.subsection??'margin-risk');}
  if(['watchlist','dark-watchlist'].includes(id))return watchlistControls()+rowList(chooseRows(),'watchlist');
  if(id==='search')return searchPage();
  if(id==='groups')return groupsPage();
  if(id==='explore'){
   const entries=[
    ['institutional','法人籌碼','外資、投信與自營商買賣超。','▥'],
    ['quant','選股與量化','短期篩選、量化條件與研究清單。','⌕'],
    ['etfs','ETF','ETF 戰情、資金流與成分揭露。','◔'],
    ['strategies','策略研究','策略、型態雷達與回測報告。','▤']
   ];
   const entry=([routeId,name,description,icon])=>`<a class="explore-entry" href="#/${encodeURIComponent(routeId)}" aria-label="${e(name)}：${e(description)}"><span class="explore-entry-icon" aria-hidden="true">${icon}</span><span class="explore-entry-content"><strong>${e(name)}</strong><small>${e(description)}</small></span><span class="explore-entry-arrow" aria-hidden="true">›</span></a>`;
   state.exploreMarketTab??='taiwan';
   const selectedMarket=state.exploreMarketTab;
   const marketToday=selectedMarket==='us'
     ?new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
     :taipeiDay();
   for(const row of state.indices){
     const cached=state.exploreMarketQuotes[row.symbol];
     if(cached&&(cached.date!==marketToday||row.asOf===marketToday))delete state.exploreMarketQuotes[row.symbol];
   }
   const quoteLoader=selectedMarket==='us'?modules.marketQuotes:modules.marketIndexQuotes;
   try{Object.assign(state.exploreMarketQuotes,await quoteLoader(state));}catch{}
   const marketIndices=state.indices.map(row=>({...row,...(state.exploreMarketQuotes[row.symbol]??{})}));
   const market=exploreMarketMarkup({indices:marketIndices,selected:state.exploreMarketTab,link,favoriteButton});
   return entries.map(entry).join('')+card('市場總覽',market,'explore-market-summary');
  }
  if(id==='more')return moreMenuMarkup(state.contract.routes);
  if(id==='tools')return card('財經試算工具',`<p class="muted">以下計算在本機完成，不會送出交易或呼叫外部行情服務。</p>`)+financialToolsMarkup()+card('財經摘要',`<p class="muted">查看已發布的市場摘要與節目內容。</p>${link('briefing')}`)+card('資料服務',`<p class="muted">管理可選資料服務連線；API 金鑰只保存在本機。</p>${link('services')}`);
  if(id==='about'){
   const webVersion=new URL(import.meta.url).searchParams.get('v')??'未提供';
   return card('TWStockTracker',`<p>市場脈動・研究洞察・資產全覽</p><div class="metric-grid">${metric('介面','Web 工作台')}${metric('Web 版本',e(webVersion))}</div>`)+card('資料來源與隱私',`<p>公開市場資料以 Public_Data 為唯一 canonical source。選用的即時資料服務只用於 Public_Data 尚未發布的盤中或當日資料。</p><p class="muted">個人持股、交易與服務金鑰保存在本機；匯出備份不包含服務金鑰。</p>`)+card('使用說明',`<p>資料不足或來源尚未發布時，介面會明確標示狀態，不以未驗證數值補值。</p>`);
  }
  if(id==='appearance'){const size=Math.max(0,Math.min(6,Number(localStorage.getItem('rebuild.appearance.font-size.v1')??3))),format=localStorage.getItem('rebuild.number-format.v1')??'general',color=localStorage.getItem('rebuild.market.colorStyle.v1')??'taiwan',reminder=localStorage.getItem('rebuild.monthly-reports-reminder.v1')!=='false',indicator=localStorage.getItem('rebuild.chart.default-indicator.v1')??'成交量',range=localStorage.getItem('rebuild.chart.default-range.v1')??'6m';return card('主題模式',`<label>外觀<select id="appearance"><option value="system">系統</option><option value="light">淺色</option><option value="dark">深色</option></select></label><p class="muted">即時套用至 App 與手機 Web 共用頁面。</p>`)+card('文字大小',`<label class="appearance-range"><span>A</span><input id="font-size" type="range" min="0" max="6" step="1" value="${size}" aria-label="文字大小"><span class="large-a">A</span><output id="font-size-value">${size===3?'標準':size<3?'較小':'較大'}</output></label><p class="muted">調整 App 內文字大小。</p>`)+card('顯示與漲跌',`<label>數字顯示格式<select id="number-format"><option value="general">一般（1,234.56）</option><option value="integer">整數（1,235）</option><option value="precise">精確（1,234.56）</option></select></label><label>漲跌顏色<select id="market-color"><option value="taiwan">台灣市場慣例（紅漲綠跌）</option><option value="western">國際慣例（綠漲紅跌）</option></select></label>`)+card('提醒',`<label class="setting-toggle">每月財報提醒<input id="monthly-reminder" type="checkbox" ${reminder?'checked':''}></label><p class="muted">每月 10 日後開啟 Web 時顯示一次提醒；不使用推播或外部資料服務。</p>`)+card('圖表顯示',`<label>預設技術指標圖表<select id="chart-indicator">${['成交量','RSI','MACD','KD','法人'].map(x=>`<option ${indicator===x?'selected':''}>${x}</option>`).join('')}</select></label><label>圖表時間範圍<select id="chart-default-range">${[['1m','1 個月'],['3m','3 個月'],['6m','6 個月'],['1y','1 年'],['all','全部']].map(([v,t])=>`<option value="${v}" ${range===v?'selected':''}>${t}</option>`).join('')}</select></label>`)+card('桌面操作',`<label>桌面單擊股票<select id="desktop-open-mode"><option value="preview" ${desktopOpenMode()==='preview'?'selected':''}>在工作台預覽</option><option value="detail" ${desktopOpenMode()==='detail'?'selected':''}>開啟完整詳情</option></select></label><p class="muted">雙擊或在整列按 Enter 開啟完整詳情；手機點選仍直接進入詳情。</p><p id="desktop-open-feedback" role="status"></p>`,`desktop-only-setting`);}
  if(id==='sync')return card('資料同步狀態',`${metric('台股歷史行情',e(state.index?.latest_daily_tw??'尚未同步'))}${metric('大盤行情',e(state.index?.latest_daily_tw_indices??'尚未同步'))}${metric('目前股票 universe',e(state.listing?.cutoff??'尚未確認'))}${metric('資格依據',e(state.listing?.source??'Public_Data stocks.json'))}<p class="muted">目前股票名冊一律依 Public_Data meta/stocks.json；listing-eligibility.json 只補充市場與證券類型，不可排除仍列於 stocks.json 的股票。不在 stocks.json 的代號不列入現行行情篩選。</p><button class="primary" data-action="reload">重新載入資料</button>`)+card('GitHub Raw 最近 30 日快取',`<p>下載 index.json 列出的最近 30 日台股／指數／資券／美股／ETF 日行情與相交週線；最多 160 檔、同時 4 個請求，資料寫入瀏覽器離線快取。個股財報、月營收、股利及其他非日期分片資料仍按頁載入；不觸發 Fugle、匯率或 Gemini。</p><button class="primary" data-action="prefetch-raw-month">下載最近 30 日 Raw 行情</button><p id="raw-month-progress" class="muted" role="status" aria-live="polite"></p>`);
  if(['fields','field-order'].includes(id))return card('顯示欄位',fieldsEditor('watchlist'));
  if(id==='list-preview')return rowList(chooseRows(),'watchlist');
  if(id==='empty'){const popular=[...state.rows].filter(row=>Number.isFinite(row.volume)&&row.volume>0).sort((a,b)=>b.volume-a.volume||a.symbol.localeCompare(b.symbol)).slice(0,5);return status('尚未加入自選股','搜尋股票，建立您的觀察清單。','☆')+card('',link('search'))+(popular.length?card('熱門排行',rowList(popular,'hot')):status('熱門排行資料不足','Public_Data 當日行情未提供有效成交量；不以缺值生成排行。'));}
  if(id==='error')return marketOverview({state,card,metric,link,rowList,favoriteButton,publicData,marketQuotes:modules.marketQuotes,marketIndexQuotes:modules.marketIndexQuotes,failureState:true},'overview');
  if(id==='startup-error')return status('資料載入失敗','既有本機資料仍保留。請檢查網路或至資料同步重試。','!',true);
  if(['preflight','upgrade'].includes(id))return card('資料保留狀態',`<p>原 IndexedDB：TWStockTrackerDB／trades</p><p>原有交易 ${state.checkpoint?.count??0} 筆</p><p class="source muted">備份 checksum：${e(state.checkpoint?.hash??'尚未完成')}</p><p>目前採相容讀取，未變更原有儲存格式。</p><button data-action="diagnostics">匯出診斷摘要</button><p class="muted">摘要僅含檢查階段、筆數與 checksum，不含交易內容或服務金鑰。</p>`);
  return unfinished(id);
}
const modules=featureModules({state,card,metric,status,rowList,link,favoriteButton,publicData,loadRecentDailyChart,title,transactions,navigate,fieldsEditor,chooseRows,refresh:render});
modules.listen(app);
function desktopHeaderTools(){
 const dataDate=state.index?.latest_daily_tw??'日期不足';
 return `<form class="desktop-global-search" id="desktop-global-search" role="search"><input id="desktop-global-search-input" type="search" name="query" aria-label="搜尋股票名稱或代號" placeholder="搜尋股票名稱或代號（例如：台積電 2330）" autocomplete="off"><button type="submit" aria-label="搜尋股票"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg></button></form><span class="desktop-data-status">Public_Data・資料日 ${e(dataDate)}・非即時</span><a class="desktop-header-settings" href="#/services" aria-label="資料服務設定" title="資料服務設定"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6Z"/><path d="m19.4 13.8 1.1.9-1.4 2.4-1.4-.5a7.8 7.8 0 0 1-1.5.9l-.3 1.5h-2.8l-.3-1.5a7.8 7.8 0 0 1-1.5-.9l-1.4.5-1.4-2.4 1.1-.9a7.7 7.7 0 0 1 0-1.8l-1.1-.9 1.4-2.4 1.4.5a7.8 7.8 0 0 1 1.5-.9l.3-1.5h2.8l.3 1.5a7.8 7.8 0 0 1 1.5.9l1.4-.5 1.4 2.4-1.1.9a7.7 7.7 0 0 1 0 1.8Z"/></svg></a>`;
}
function launch(){return`<main id="main"><section class="launch" data-route="launch"><div class="launch-brand"><div class="brandmark" aria-hidden="true"><svg viewBox="0 0 64 48"><path d="M3 34 18 20l10 8L46 9l8 7M46 9h9v9"/></svg></div><div><h1>TWStockTracker</h1><p>市場脈動・研究洞察・資產全貌</p></div></div><section class="launch-welcome"><h2>為每一次投資決策，準備好全貌。</h2><p>從市場總覽到個股研究，再到自己的資產與交易紀錄，在同一個工作空間接續查看。</p><div class="launch-features"><article><span aria-hidden="true">▥</span><strong>市場</strong><small>行情與圖表</small></article><article><span aria-hidden="true">⌕</span><strong>探索</strong><small>篩選與研究</small></article><article><span aria-hidden="true">▤</span><strong>資產</strong><small>持倉與紀錄</small></article></div><div class="launch-local"><strong>沿用這台裝置上的自選、交易與投資紀錄</strong>${state.showStartupCompletion?'<p role="status">✓ 本機資料檢查完成，原有紀錄仍保留在原位置。</p>':'<p role="status">本機資料檢查已完成，可直接進入工作區。</p>'}</div></section><button class="primary launch-action" data-action="start">進入市場 <span aria-hidden="true">→</span></button><p class="muted launch-footnote">資料不足或離線時，會明確標示資料狀態。此畫面不顯示未驗證的即時行情。</p></section></main>`;}
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
  const current=++generation,routeInfo=route(),{id}=routeInfo,symbol=previewSymbolForRoute(id,routeInfo.symbol);
  document.documentElement.dataset.theme=themeForRoute(id);applyAppearancePreferences();
  if(id==='launch'){app.innerHTML=launch();document.title='TWStockTracker 全新介面';routeLoading=false;return;}
  const item=state.contract.routes.find(r=>r.id===id),tab=primaryTabForRoute(id,item?.tab);
  app.innerHTML=`<header class="topbar"><span class="brand">TWStockTracker</span>${desktopHeaderTools()}<button data-action="back" aria-label="返回">‹</button><h1>${e(title(id))}</h1>${['watchlist','dark-watchlist'].includes(id)?watchlistOverflow():id==='groups'?`<a class="topbar-done" href="#/watchlist" aria-label="完成">完成</a>`:id==='search'?'':`<a href="#/search" aria-label="搜尋股票"><svg class="topbar-search-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg></a>`}${workspaceControls(tab)}</header><div class="workspace"><main id="main" class="page" data-route="${e(id)}">${status('載入中','正在讀取頁面資料…')}</main><div class="workspace-divider" role="separator" tabindex="0" aria-label="調整詳情面板寬度" aria-orientation="vertical" aria-valuemin="25" aria-valuemax="48"></div><aside class="desktop-inspector" aria-label="個股檢查器">${status('個股摘要','點選清單，在這裡並列檢視行情。')}</aside><aside class="desktop-research-detail" aria-label="基本資料與近期觀察">${status("基本資料與近期觀察","選擇股票後，在此並列閱讀資料與來源日期。")}</aside></div>${bottomNavMarkup(state.contract.tabs,tab)}`;
  const m23RootTitle={empty:'自選',error:'市場',offline:'資產'}[id];
  if(m23RootTitle){
   app.querySelector('.topbar h1').textContent=m23RootTitle;
   app.querySelector('.topbar [data-action="back"]')?.remove();
   if(id==='offline'){
    const settings=app.querySelector('.topbar a[aria-label="搜尋股票"]');
    if(settings){settings.href='#/more';settings.setAttribute('aria-label','設定');settings.textContent='⚙︎';}
   }
  }
  try{
    const extension=await modules.page(id,symbol);const body=extension??await content(id,symbol);if(current!==generation)return;
    const detailRow=state.rows.find(row=>row.symbol===symbol);
    const isETFRoute=['M18','M19'].includes(item?.concept)||detailRow?.securityType==='fund'||['constituents','rebalance','etf-performance','fund','bond'].includes(id);
    let routeBody=navigationForRouteContent({body,securityRoute:item?.tab==='security',securityNavigation:item?.tab==='security'&&symbol?securityNavigation(symbol,id,isETFRoute):'',conceptNavigation:conceptTabs(state.contract.routes,id,{symbol})});
    if(id==='security'&&symbol&&matchMedia('(min-width:1100px)').matches){
      let financials='';
      if(resolveListingStatus(symbol,taipeiDay(),state.listing).eligible){
        const row=state.rows.find(item=>item.symbol===symbol)??{...identity(symbol,state.listing?.stocks?.[symbol])};
        try{financials=await desktopCompanyFinancials({publicData,card},symbol,row);}
        catch(error){financials=card('財務摘要',status('財務資料暫不可用',error.message,'↗',true));}
      }
      routeBody=await desktopSecurityLayout(symbol,body,financials,resolveListingStatus(symbol,taipeiDay(),state.listing).eligible);
    }
    const d06Desktop=matchMedia('(min-width: 1100px)').matches&&['more','fields','field-order'].includes(id);
    const listingWarningHidden=state.error===LISTING_EXPIRY_MESSAGE&&!listingWarningAppliesToRoute(id);
    const quoteWarningHidden=state.error?.startsWith('官方漲跌參考快照')&&!marketQuoteWarningAppliesToRoute(id);
    const visibleError=listingWarningHidden||quoteWarningHidden?null:state.error;
    const compactOverviewWarning=id==='overview'&&visibleError===LISTING_EXPIRY_MESSAGE;
    const alertMarkup=visibleError&&!d06Desktop?`<div class="alert" role="alert"${compactOverviewWarning?` aria-label="${e(visibleError)}"`:''}><span>${e(compactOverviewWarning?'Public_Data 股票名冊未提供・股票清單暫停':visibleError)}</span><button data-action="reload">重試</button></div>`:'';
    if(/^<nav class="(?:detail-sections|concept-tabs|market-tabs)"/.test(routeBody)){
      const navEnd=routeBody.indexOf('</nav>')+6;
      routeBody=routeBody.slice(0,navEnd)+alertMarkup+routeBody.slice(navEnd);
      document.querySelector('#main').innerHTML=monthlyReminderMarkup()+routeBody;
    }else document.querySelector('#main').innerHTML=alertMarkup+monthlyReminderMarkup()+routeBody;
    document.querySelectorAll('#main .rows[data-list-paged]').forEach(list=>{const size=Number(list.dataset.listSize)||10;list.querySelectorAll('.row,.search-result-row,.watchlist-stock-row').forEach((row,index)=>{if(index>=size)row.style.display='none';});const pager=list.querySelector('[data-list-pagination]');if(pager)pager.querySelector('span').textContent=`第 1 頁・1–${Math.min(size,Number(list.dataset.listTotal)||0)}／${list.dataset.listTotal} 檔`;});
    mountMobileCardPagination(document.querySelector('#main'));
    mountCharts(document.querySelector('#main'));
    workspaceCleanup=mountWorkspace(app,tab);
    panelCleanup=mountPanelLayout(app);
    if(state.inspector&&!app.querySelector('.desktop-page'))inspect(state.inspector);
    const heatmap=document.querySelector('[data-heatmap]');if(heatmap)heatmapCleanup=mountHeatmap(heatmap,state.rows,{showMarketFilter:id==='heatmap'||innerWidth<1100,favoriteButton});
    document.title=`${m23RootTitle??title(id)} · TWStockTracker`;
    if(id==='appearance'){document.querySelector('#appearance').value=localStorage.getItem('rebuild.appearance.v1')??'system';document.querySelector('#number-format').value=localStorage.getItem('rebuild.number-format.v1')??'general';document.querySelector('#market-color').value=localStorage.getItem('rebuild.market.colorStyle.v1')??'taiwan';}
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
async function desktopSecurityEvents(symbol){
 const cutoff=new Date(`${taipeiDay()}T00:00:00+08:00`);cutoff.setUTCDate(cutoff.getUTCDate()-30);const cutoffDay=cutoff.toISOString().slice(0,10),loaded=await Promise.allSettled([publicData('announcements/parsed/latest.json'),publicData(`dividends/${encodeURIComponent(symbol)}.json`)]),events=[],dates=[];let failures=0;
 if(loaded[0].status==='fulfilled'){
  const rows=Array.isArray(loaded[0].value.updates)?loaded[0].value.updates:[];
  for(const row of rows){if(row.symbol!==symbol||typeof row.title!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(row.date??''))continue;dates.push(row.date);if(row.date>=cutoffDay&&row.date<=taipeiDay())events.push({date:row.date,title:row.title.trim(),source:'Public_Data・公司公告'});}
 }else failures++;
 if(loaded[1].status==='fulfilled'){
  const rows=Array.isArray(loaded[1].value.data)?loaded[1].value.data:[];
  for(const row of rows){if(!/^\d{4}-\d{2}-\d{2}$/.test(row.date??'')||!Number.isFinite(row.cash)||!Number.isFinite(row.stock))continue;dates.push(row.date);if(row.date>=cutoffDay&&row.date<=taipeiDay())events.push({date:row.date,title:`除權息・現金股利 ${number(row.cash)} 元・股票股利 ${number(row.stock)} 股`,source:'Public_Data・股利事件'});}
 }else failures++;
 events.sort((a,b)=>b.date.localeCompare(a.date)||a.title.localeCompare(b.title,'zh-Hant'));
 if(events.length)return `<ol class="desktop-security-events">${events.slice(0,4).map(item=>`<li><a href="#/news?symbol=${encodeURIComponent(symbol)}&category=${item.source.includes('股利')?'dividends':'announcements'}"><time datetime="${e(item.date)}">${e(item.date)}</time><span>${e(item.title)}</span><small>${e(item.source)}</small></a></li>`).join('')}</ol>`;
 if(failures)return `<p class="muted">官方事件來源暫不可用（${failures}/2）；資料不足不代表沒有事件。</p>`;
 const latest=dates.filter(date=>date<=taipeiDay()).sort().at(-1);
 return `<p class="muted">${latest&&latest<cutoffDay?`官方資料最新日期 ${e(latest)}，已超過 30 日。`:'最近 30 日沒有可核實的公司公告或除權息事件。'}資料不足不等於沒有公司事件。</p>`;
}
async function desktopSecurityLayout(symbol,body,financials='',marketEligible=true){
 const row=state.rows.find(item=>item.symbol===symbol)??identity(symbol,state.listing?.stocks?.[symbol]);
 const watch=marketEligible?chooseRows().filter(item=>resolveListingStatus(item.symbol,taipeiDay(),state.listing).eligible).slice(0,12):[];
 const watchRows=desktopSecurityWatchRows(watch,{securityTarget,stockSummary,format,movement,favoriteButton});
 const events=marketEligible?await desktopSecurityEvents(symbol):'<p class="muted">上市資格尚未確認，暫不載入個股事件。</p>';
 const sidebar=card('基本資料',`<div class="desktop-security-facts">${[['產業','sector'],['市值','marketCap'],['流通股數','sharesOutstanding'],['本益比（TTM）','pe'],['預估本益比','forwardPE'],['股價淨值比','priceToBook'],['殖利率（TTM）','yield'],['52 週高','week52High'],['52 週低','week52Low'],['EPS（TTM）','eps'],['ROE（TTM）','roe']].map(([label,key])=>metric(label,marketEligible?format(row,key):'資料不足')).join('')}</div><p class="muted">${marketEligible?`原始市價 ${format(row,'price')}・資料日期 ${e(row.asOf??'尚未載入')}。`:'上市資格尚未確認；不載入現價或財務分析。'}缺少來源的欄位維持資料不足。</p>`)+card('近期事件（官方資料）',`${events}${link('news','查看新聞與事件',symbol)}`);
 return `<div class="desktop-security-layout"><aside class="desktop-security-watchlist">${card('自選清單',watchRows)}${link('watchlist','管理自選')}</aside><section class="desktop-security-content">${body}${financials}</section><aside class="desktop-security-sidebar">${sidebar}</aside></div>`;
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
  const valuationTab=event.target.closest('[data-valuation-tab]');
  if(valuationTab){const host=valuationTab.closest('.valuation-evidence'),selected=valuationTab.dataset.valuationTab;if(!host)return;host.querySelectorAll('[data-valuation-tab]').forEach(button=>{const active=button===valuationTab;button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;button.classList.toggle('primary',active);});host.querySelectorAll('[data-valuation-panel]').forEach(panel=>{panel.hidden=panel.dataset.valuationPanel!==selected;});return;}
  const stock=event.target.closest('[data-stock]');if(stock&&matchMedia('(min-width:1100px)').matches&&event.detail!==2&&!event.ctrlKey&&!event.metaKey){if(event.detail===0)return;event.preventDefault();await selectStock(stock.dataset.stock);return;}
  const cell=event.target.closest('[data-select-stock]');if(cell){await selectStock(cell.dataset.selectStock);return;}
  const button=event.target.closest('[data-action]');if(!button)return;
  const {action,context,symbol,field:f,offset}=button.dataset;
  if(action==='list-page-prev'||action==='list-page-next'){const host=button.closest('[data-list-paged]');if(!host)return;setListPage(host,(Number(host.dataset.listPage)||0)+(action==='list-page-next'?1:-1));return;}
  if(action==='mobile-page-prev'||action==='mobile-page-next'){const host=button.closest('[data-mobile-page]');if(!host)return;const cards=[...host.children].filter(node=>node.matches('.card')),size=Number(host.dataset.mobileSize)||10,total=cards.length,max=Math.max(0,Math.ceil(total/size)-1),page=Math.max(0,Math.min(max,(Number(host.dataset.mobilePageNumber)||0)+(action==='mobile-page-next'?1:-1)));host.dataset.mobilePageNumber=String(page);cards.forEach((node,index)=>{node.style.display=index>=page*size&&index<(page+1)*size?'':'none';});const pager=host.querySelector('.mobile-page-pagination'),prev=pager?.querySelector('[data-action="mobile-page-prev"]'),next=pager?.querySelector('[data-action="mobile-page-next"]'),label=pager?.querySelector('[role="status"]');if(!prev||!next||!label)return;prev.disabled=page===0;next.disabled=page===max;label.textContent=`第 ${page+1} 頁・${page*size+1}–${Math.min((page+1)*size,total)}／${total} 項`;return;}
  if(action==='search-kind'){state.searchType=button.dataset.kind;await render();return;}
  if(action==='explore-market-tab'){state.exploreMarketTab=button.dataset.value==='us'?'us':'taiwan';await render();return;}
  if(action==='search-history'){state.query=button.dataset.query;await render();return;}
  if(action==='search-history-clear'){localStorage.removeItem('rebuild.search-history.v1');await render();return;}
  try{
    if(action==='diagnostics'){
      const report={schemaVersion:1,platform:'web',stage:state.startupStage??'not-started',status:state.startupFailure?'STARTUP_FAILED':state.checkpoint?'CHECKPOINT_AVAILABLE':'NO_CHECKPOINT',exportedAt:new Date().toISOString(),checkpointAvailable:!!state.checkpoint,checkpointChecksum:state.checkpoint?.hash??null,transactionCount:state.checkpoint?.count??null,online:navigator.onLine,containsPersonalRecords:false,containsServiceCredentials:false};
      const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'})),anchor=document.createElement('a');anchor.href=url;anchor.download='twstock-startup-diagnostics.json';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;
    }
    if(action==='retry-startup'){button.disabled=true;await start();return;}
    if(action==='group-members'){openGroup(button.dataset.group);return;}
    if(action==='watch-group'){state.group=button.dataset.group;await render();return;}
    if(['group-up','group-down'].includes(action)){await mutateFavorites(groups=>{const entries=Object.entries(groups),i=entries.findIndex(([key])=>key===button.dataset.group),j=i+(action==='group-up'?-1:1);if(i>=0&&j>=0&&j<entries.length)[entries[i],entries[j]]=[entries[j],entries[i]];return Object.fromEntries(entries);});await render();return;}
    if(action==='group-member-add'){
      const key=button.dataset.group,row=searchDirectory().find(item=>item.symbol===symbol),dialog=button.closest('dialog'),query=dialog?.querySelector('#group-member-query')?.value??'';
      if(!row){const status=dialog?.querySelector('[role=status]');if(status)status.textContent='股票已不在目前 Public_Data 名冊；未加入自選。';return;}
      await mutateFavorites(groups=>{if(Object.hasOwn(groups,key))groups[key]=[...new Set([...(groups[key]??[]),row.symbol])];return groups;});
      if(dialog){dialog.innerHTML=groupMembers(key,query);const input=dialog.querySelector('#group-member-query');input?.focus();input?.setSelectionRange(query.length,query.length);}return;
    }
    if(['member-up','member-down','member-remove'].includes(action)){const key=button.dataset.group;await mutateFavorites(groups=>{const items=groups[key]??[],i=items.indexOf(symbol);if(i>=0){if(action==='member-remove')items.splice(i,1);else{const j=i+(action==='member-up'?-1:1);if(j>=0&&j<items.length)[items[i],items[j]]=[items[j],items[i]];}}return groups;});document.querySelector('dialog').innerHTML=groupMembers(key);return;}
    if(action==='start'){state.showStartupCompletion=false;try{localStorage.setItem('rebuild.startupCompletionAcknowledged.v1','1');}catch{}navigate('overview');}
    if(action==='back'){if(history.length>1)history.back();else navigate('overview');}
    if(action==='favorite'){const currentList=button.closest('.rows[data-list-paged]'),currentPage=Number(currentList?.dataset.listPage)||0;await mutateFavorites(groups=>{if(Object.values(groups).some(items=>items.includes(symbol))){for(const key of Object.keys(groups))groups[key]=groups[key].filter(item=>item!==symbol);}else{groups.cat1??=[];groups.cat1.push(symbol);}return groups;});await render();if(currentPage>0){const updatedList=document.querySelector('#main .rows[data-list-paged]');if(updatedList)setListPage(updatedList,currentPage);}}
    if(action==='reload'){button.disabled=true;cache.clear();state.error=null;state.offline=!navigator.onLine;try{state.listing=await loadCanonicalListingSnapshot(publicData);await loadMarket();}catch(error){state.error=error.message;}await render();}
    if(action==='prefetch-raw-month'){await prefetchRecentRawMonth(button);}
    if(action==='fields')openFields(context);
    if(action==='close-fields'){const dialog=document.querySelector('dialog'),wasGroup=!!dialog?.querySelector('[data-group-management]');dialog?.close();if(wasGroup)await render();return;}
    if(['reverse','sort-field','add-field','hide-field','move-field','reset-fields'].includes(action)){
      let p=pref(context);
      if(action==='reverse')p.descending=!p.descending;
      if(action==='sort-field'){p.sort=f;p.manual=false;}
      if(action==='add-field'&&!p.fields.includes(f))p.fields.push(f);
      if(action==='hide-field')p.fields=p.fields.filter(x=>x!==f);
      if(action==='move-field'){const i=p.fields.indexOf(f),j=i+Number(offset);if(i>=0&&j>=0&&j<p.fields.length)[p.fields[i],p.fields[j]]=[p.fields[j],p.fields[i]];}
      if(action==='reset-fields')p=context==='watchlist'?{version:1,fields:[...D06_DEFAULT_FIELDS],sort:'changePercent',descending:true,manual:true}:defaultPreference();savePref(context,p);
      const dialog=document.querySelector('dialog');if(dialog?.open)dialog.innerHTML=fieldsEditor(context);else await render();
    }
    if(action==='chart-zoom'){state.chartCount=Math.max(10,Math.min(1000,state.chartCount+Number(offset)));await render();}
    if(action==='backup'){state.checkpoint=await preflight();const blob=new Blob([JSON.stringify(exportBackup(state.checkpoint),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`TWStockTracker-backup-${taipeiDay()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  }catch(error){const notice=document.createElement('p');notice.className='alert';notice.role='alert';notice.textContent=error.message;button.after(notice);}
});
app.addEventListener('dblclick',event=>{if(event.target.closest('button,input,select,[data-column-resize]'))return;const row=event.target.closest('[data-row-stock]'),stock=event.target.closest('[data-stock]');const symbol=row?.dataset.rowStock||stock?.dataset.stock;if(symbol)navigate(securityTarget(symbol),symbol);});
app.addEventListener('input',event=>{const t=event.target;if(t.id!=='font-size')return;try{localStorage.setItem('rebuild.appearance.font-size.v1',t.value);}catch{}applyAppearancePreferences();const output=document.querySelector('#font-size-value');if(output)output.textContent=Number(t.value)===3?'標準':Number(t.value)<3?'較小':'較大';});
app.addEventListener('change',async event=>{const t=event.target;if(['number-format','market-color','monthly-reminder','chart-indicator','chart-default-range'].includes(t.id)){const key={'number-format':'rebuild.number-format.v1','market-color':'rebuild.market.colorStyle.v1','monthly-reminder':'rebuild.monthly-reports-reminder.v1','chart-indicator':'rebuild.chart.default-indicator.v1','chart-default-range':'rebuild.chart.default-range.v1'}[t.id],value=t.id==='monthly-reminder'?String(t.checked):t.value;try{localStorage.setItem(key,value);}catch{const note=t.closest('.card')?.querySelector('.muted');if(note)note.textContent='無法保存偏好，請確認瀏覽器儲存權限。';return;}if(t.id==='market-color')applyAppearancePreferences();if(t.id==='chart-default-range')state.chartCount=({'1m':20,'3m':60,'6m':120,'1y':250,all:250}[t.value]??120);await render();return;}});
app.addEventListener('change',async event=>{const t=event.target;if(t.dataset.action==='toggle-display-field'){const context=t.dataset.context,id=t.dataset.field,p=pref(context);p.fields=t.checked?[...new Set([...p.fields,id])]:p.fields.filter(value=>value!==id);savePref(context,p);await render();return;}if(t.id==='desktop-open-mode'){try{localStorage.setItem('rebuild.desktopOpen.v1',t.value);document.querySelector('#desktop-open-feedback').textContent='桌面操作偏好已保存。';}catch{document.querySelector('#desktop-open-feedback').textContent='無法保存偏好，請確認瀏覽器儲存權限。';}}if(t.dataset.sort){const p=pref(t.dataset.sort);p.manual=t.value==='manual';if(!p.manual)p.sort=t.value;savePref(t.dataset.sort,p);await render();}if(t.id==='appearance')setTheme(t.value);if(t.id==='watch-group'){state.group=t.value;await render();}if(t.id==='chart-period'){state.chartCount=Number(t.value);await render();}});
let queryTimer;app.addEventListener('input',event=>{if(event.target.id==='stock-search'){state.query=event.target.value;clearTimeout(queryTimer);queryTimer=setTimeout(render,150);}});
app.addEventListener('keydown',event=>{if(event.target.id==='stock-search'&&event.key==='Enter'){event.preventDefault();rememberSearch(state.query);render();}});
app.addEventListener('submit',async event=>{if(event.target.id==='add-group'){event.preventDefault();const name=new FormData(event.target).get('name').trim();if(!name)return;try{await mutateFavorites(groups=>{if(!Object.hasOwn(groups,name))Object.defineProperty(groups,name,{value:[],writable:true,enumerable:true,configurable:true});return groups;});await render();}catch(error){state.error=error.message;await render();}}});
app.addEventListener('submit',event=>{
 const form=event.target.closest?.('[data-financial-tool]');if(!form)return;
 event.preventDefault();
 const output=form.querySelector('[role="status"]');
 if(output)output.textContent=calculateFinancialTool(form.dataset.financialTool,new FormData(form));
});
let dragging,draggingGroup;app.addEventListener('dragstart',event=>{const group=event.target.closest('[data-drag-group]');if(group){draggingGroup=group.dataset.dragGroup;event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',`group:${draggingGroup}`);return;}const el=event.target.closest('[data-drag-field]');if(el){dragging=el.dataset;event.dataTransfer.setData('text/plain',el.dataset.dragField);}});app.addEventListener('dragover',event=>{if(event.target.closest('[data-drag-field],[data-drag-group]'))event.preventDefault();});app.addEventListener('drop',async event=>{const targetGroup=event.target.closest('[data-drag-group]');if(targetGroup&&draggingGroup){event.preventDefault();const source=draggingGroup,target=targetGroup.dataset.dragGroup;draggingGroup=null;if(source===target)return;await mutateFavorites(groups=>{const entries=Object.entries(groups),from=entries.findIndex(([key])=>key===source),to=entries.findIndex(([key])=>key===target);if(from>=0&&to>=0)entries.splice(to,0,entries.splice(from,1)[0]);return Object.fromEntries(entries);});await render();return;}const el=event.target.closest('[data-drag-field]');if(!el||!dragging||dragging.context!==el.dataset.context)return;event.preventDefault();const p=pref(dragging.context),i=p.fields.indexOf(dragging.dragField),j=p.fields.indexOf(el.dataset.dragField);if(i<0||j<0)return;p.fields.splice(j,0,p.fields.splice(i,1)[0]);savePref(dragging.context,p);const d=document.querySelector('dialog');if(d?.open)d.innerHTML=fieldsEditor(dragging.context);else await render();});
app.addEventListener('submit',event=>{
 if(event.target.id!=='desktop-global-search')return;
 event.preventDefault();
 const query=String(new FormData(event.target).get('query')??'').trim();
 state.query=query;
 routeStates.set('#/search',{query,group:'all',inspector:null});
 if(query)rememberSearch(query);
 if(route().id==='search')void render();else navigate('search');
});
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
  // Legacy favorites remain untouched in browser storage; a new Web watchlist starts empty.
  state.startupStage='list-preference-migration';
  const listMigration=await migrateLegacyListPreferences(legacyListPreferenceMigrations());
  if(listMigration.migrated)state.checkpoint=await preflight();
  state.startupStage='listing-boundary';state.listing=await loadCanonicalListingSnapshot(publicData);
  document.documentElement.dataset.theme=themeForRoute('');
  state.startupStage='market-sources';try{await loadMarket();}catch(error){state.error=error.message;}
  state.showStartupCompletion=localStorage.getItem('rebuild.startupCompletionAcknowledged.v1')!=='1';
  state.startupStage='ready';state.startupReady=true;await render();
 }catch(error){
  state.startupFailure=true;state.startupReady=false;
  app.innerHTML=`<main id="main" class="launch">${status('啟動檢查未完成',error.message+'。原始資料已保留。','!',false)}<button data-action="retry-startup">保留原資料並重試</button><button data-action="diagnostics">匯出診斷摘要</button><p>摘要不含交易內容、偏好值或服務金鑰。</p></main>`;
 }finally{state.startupBusy=false;}
}
let eligibilityDay=taipeiDay();setInterval(()=>{if(taipeiDay()!==eligibilityDay){eligibilityDay=taipeiDay();state.rows=[];state.error='交易日期已變更，請重新載入 Public_Data 股票名冊與行情。';render();}},30000);
window.addEventListener('online',async()=>{if(!state.startupReady)return;state.offline=false;state.error=null;cache.clear();try{state.listing=await loadCanonicalListingSnapshot(publicData);await loadMarket();}catch(error){state.error=error.message;}await render();});
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js?v=144',{scope:'./'}).catch(()=>{});
await start();
app.addEventListener('change',async event=>{const t=event.target;if(!t.dataset.memberMove||!t.value)return;const source=t.dataset.group,destination=t.value,symbol=t.dataset.memberMove;try{await mutateFavorites(groups=>{if(Object.hasOwn(groups,destination)&&Object.hasOwn(groups,source)){groups[source]=groups[source].filter(x=>x!==symbol);groups[destination]=[...new Set([...groups[destination],symbol])];}return groups;});document.querySelector('dialog').innerHTML=groupMembers(source);}catch(error){state.error=error.message;await render();}});
app.addEventListener('input',event=>{const input=event.target;if(input?.id!=='group-member-query')return;const form=input.closest('#group-add-member'),host=form?.querySelector('#group-member-suggestions');if(!form||!host)return;host.innerHTML=groupMemberSuggestions(form.dataset.group,input.value);form.querySelector('[role=status]').textContent='';});
app.addEventListener('submit',event=>{if(event.target.id!=='group-add-member')return;event.preventDefault();event.target.querySelector('[role=status]').textContent='請從下方股票建議列點選星號加入；未選取的文字不會新增。';});
matchMedia('(min-width: 1100px)').addEventListener('change',()=>render());
app.addEventListener('click',event=>{const anchor=event.target.closest('a[href^="#"]');if(anchor){if(anchor.dataset.stock)state.inspector=anchor.dataset.stock;saveRouteState();}},{capture:true});
window.addEventListener('pagehide',saveRouteState);
