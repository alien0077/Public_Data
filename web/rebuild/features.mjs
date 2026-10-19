import {createDesktopPages} from './desktop-pages.mjs?v=71';
import {createFlowHistory} from './flow-history.mjs';
import {createNewsPage} from './news.mjs?v=49';
import {createTransferModule} from './transfer.mjs?v=9';
import {createServicesModule,renderValuationEvidenceTabs} from './services.mjs?v=61';
import {periodHistory} from './periods.mjs?v=46';
import {valuationRange} from './valuation-range.mjs';
import {shareholderDistributionPage} from './shareholders.mjs?v=45';
import {renderHealth} from './health.mjs?v=47';
import {createETFUnitFlows,fundInformation,fundDisclosure,quarterlyETFDisclosure} from './etf.mjs';
import {createETFMarketPage} from './etf-battle.mjs?v=6';
import {createAssetsModule} from './assets.mjs?v=3';
import {createExploreModule} from './explore.mjs?v=13';
import {renderMacroDashboard} from './macro-dashboard.mjs?v=2';
import {createRotationPage} from './rotation.mjs?v=7';
import {emptyScanner,validateScanner,filterScannerRows,readScannerPreference} from './scanner.mjs';
import {normalizedInstitutional,flowSeries,flowChart,median,etfPerformanceView,rebalanceEntries,fxConversion,fxRateDisplay,fxRangePoints,fxTrendChart,m25Tabs,uniquePublishDates,quantRows,validFxRows} from './research.mjs';
import {availableETFHistoryRanges,decodeETFRawHistory,decodeETFNavHistory,filterETFHistoryRange} from './etf-history.mjs?v=4';
export function sourcedBusinessSummary(value){
 const text=typeof value==='string'?value.trim():'';
 return text&&!/(屬於 |相關標的|相關標題|新發現)/.test(text)?text:null;
}
export function companyBusinessSummary(profile){
 const summary=sourcedBusinessSummary(profile?.business_summary);
 if(!summary||typeof profile?.business_summary_source_url!=='string'||!profile.business_summary_retrieved_at?.trim())return null;
 try{const source=new URL(profile.business_summary_source_url);return source.protocol==='https:'&&source.hostname?summary:null;}catch{return null;}
}
export function companyProfileFacts(symbol,row={},source=null,listing=null){
 const validSource=source?.stock_id===symbol?source:null;
 return {
  '公司名稱':row?.name||validSource?.name||symbol,
  '官方產業':row?.sector||validSource?.sector?.name||validSource?.sector||'資料不足',
  '市場':row?.market||listing?.stocks?.[symbol]?.market||validSource?.market||'資料不足',
  '資料日期':validSource?.date||'資料日期不足',
  '基本資料來源日期':validSource?.source_dates?.price||'資料日期不足'
 };
}
export function briefingSourceURL(episode){
 try{const url=new URL(episode?.source_url);return ['https:','http:'].includes(url.protocol)&&url.hostname?url.href:null;}catch{return null;}
}
export function briefingSourceLink(episode){
 const url=briefingSourceURL(episode);
 return url?'<a href="'+e(url)+'" target="_blank" rel="noopener noreferrer">開啟節目來源</a>':'<span>來源連結不足</span>';
}
export function officialCompanyProfileLinks(profile){
 const output=[];
 for(const [label,value] of [['公司官方網站',profile?.homepage],['官方公司基本資料',profile?.official_profile_url],['業務敘述官方來源',profile?.business_summary_source_url]]){
  try{const url=new URL(value);if(url.protocol==='https:')output.push(`<a class="directory-link" href="${e(url.href)}" target="_blank" rel="noopener noreferrer">${label} ↗</a>`);}catch{}
 }
 return output.join('');
}
import {createM03Research} from './m03-research.mjs?v=4';
import {createM04Hot} from './m04-hot.mjs';
import {createM04Research} from './m04-research.mjs';
import {chooseThemeGroup,filterThemeGroups} from './theme-tabs.mjs';
import {number as n,escapeHTML as e,resolveListingStatus,taipeiDay,compareCodepoints,identity} from './core.mjs';
import {marketTabs} from './market-tabs.mjs';
export function featureModules(ctx){
 const transfer=createTransferModule(ctx),services=createServicesModule(ctx),etfUnitFlows=createETFUnitFlows(ctx),rotation=createRotationPage(ctx),assets=createAssetsModule(ctx),explore=createExploreModule(ctx);
 const desktop=createDesktopPages(ctx,explore,transfer);
 const flowHistory=createFlowHistory(ctx);
 let themeQuery='',themeSelected='',briefingDate='',briefingIndex=0,briefingShowAll=false,macroSection='overview';
 const newsPage=createNewsPage(ctx);
 const {state,card,metric,status,rowList,link,publicData,favoriteButton=()=>''}=ctx;let institutionalSource='combined',from='',to='',selectedSector='',minimumBuyDays=0,minimumLots=0,flowQuery='';let fxData=null,fxRange='1w',quantSelection='all',quantStrategyMode='factor';let scannerDraft=readScannerPreference(localStorage),scannerApplied=validateScanner(scannerDraft).filter,scannerError='';let scannerTab='factors';
 const m03=createM03Research(ctx);
 const m04Hot=createM04Hot(ctx);
 const m04Research=createM04Research(ctx);
 const etfMarket=createETFMarketPage(ctx);

 function updateFxConversion(){const form=document.querySelector('#fx-form'),output=document.querySelector('#fx-result');if(!form||!output)return;const latest=validFxRows(fxData?.data||[],taipeiDay()).at(-1),amount=Number(form.elements.namedItem('amount')?.value),from=form.elements.namedItem('from')?.value,to=form.elements.namedItem('to')?.value,value=fxConversion(amount,latest?.[from],latest?.[to]);output.textContent=value===null?'資料不足':new Intl.NumberFormat('zh-TW',{maximumFractionDigits:2}).format(value);output.setAttribute('aria-label',value===null?'匯率資料不足，無法換算':'換算結果 '+output.textContent+' '+(to?.replace('_TWD','')||''));}
 const input=(name,label,value='',type='number')=>`<label>${label}<input name="${name}" type="${type}" value="${e(value)}" ${type==='number'?'step="any" min="0"':''} required></label>`;
 const facts=obj=>`<div class="metric-grid">${Object.entries(obj).map(([k,v])=>metric(k,typeof v==='number'?n(v):e(v??'資料不足'))).join('')}</div>`;
 const directory=ids=>card('',ids.map(id=>link(id)).join(''));
 const optionalCanonicalData=async path=>{try{return{data:await publicData(path),missing:false};}catch(error){if(/資料讀取失敗（404）/.test(error?.message??''))return{data:null,missing:true,error};throw error;}};
 async function page(id,symbol){
 if(m03.handles(id))return m03.page(id);
 if(m04Hot.handles(id))return m04Hot.page(id);
 if(m04Research.handles(id))return m04Research.page();
 if(desktop.handles(id))return desktop.page(id);
 if(id==='etfs')return etfMarket.page();
 if(transfer.handles(id))return transfer.page(id);
 if(id==='services')return services.page();
 if(id==='macro'){try{return m25Tabs('macro')+renderMacroDashboard(await publicData('macro/dashboard.json'),new Date(),macroSection);}catch(error){return m25Tabs('macro')+status('宏觀總覽暫不可用',error?.message??'Public_Data macro/dashboard.json 讀取失敗。');}}
 if(id==='etf-flows')return etfUnitFlows.page();
 if(explore.handles(id))return explore.page(id,symbol);
 const assetPage=await assets.page(id,symbol);if(assetPage!==null)return assetPage;
 for(const f of [{id:'institutionalNet',title:'淨買賣超（張）'},{id:'trackingDays',title:'追蹤天數'},{id:'buyDays',title:'區間買超天數'},{id:'eps',title:'EPS'},{id:'score',title:'模型分數'}])if(!state.contract.fields.some(x=>x.id===f.id))state.contract.fields.push(f);
  if(id==='rotation')return rotation.page();
  if(id==='sector-monthly-flow')return await rotation.monthlyPage();
  if(id==='hot'){const rows=[...state.rows].filter(r=>Number.isFinite(r.volume)&&r.volume>0).sort((a,b)=>b.volume-a.volume||compareCodepoints(a.symbol,b.symbol)).slice(0,30);return card('成交量熱門排行',facts({'排行依據':'最新原始成交股數前 30 檔','行情日期':state.index.latest_daily_tw,'證券範圍':'Public_Data stocks.json 現行名冊'})+'<p class="muted">此頁為成交量排行；不當作產業漲幅或推薦訊號。</p>')+rowList(rows,'hot');}
  if(id==='quant'){const result=await optionalCanonicalData('quant/latest_portfolio.json'),d=result.data??{},portfolio=d.portfolio||[],eligible=portfolio.filter(p=>state.rows.some(row=>row.symbol===p.stock)),items=eligible.filter(p=>quantSelection==='all'||(quantSelection==='held'?p.is_held:!p.is_held)),quoteDate=state.index?.latest_daily_tw,stale=Boolean(d.date&&quoteDate&&d.date<quoteDate),tabs=[['factor','多因子選股'],['momentum','動能趨勢'],['value','低估值'],['dividend','高股息']],tabBar=`<div class="m04-quant-tabs" role="group" aria-label="量化策略模式">${tabs.map(([value,label])=>`<button type="button" data-quant-style="${value}" aria-pressed="${quantStrategyMode===value}" ${result.missing?'disabled':''} class="${quantStrategyMode===value?'primary':''}">${label}</button>`).join('')}</div>`,header=card('量化精選',`${tabBar}<p>模型日期：${e(d.date??'資料日期不足')}・行情資料日期：${e(quoteDate??'日期不足')}・市場狀態：${e(d.regime??'資料不足')}</p><p>${e(d.regime_config?.description??'來源未提供市場狀態說明')}</p><p class="muted">${stale?'模型名單日期早於目前行情日期；此名單不是即時持股或投資建議。':'模型名單不是您的持股或投資建議。'}現價採原始行情；歷史進場價不作現價。</p>`);if(result.missing)return header+status('量化來源資料缺少','讀取 quant/latest_portfolio.json 回應 404；請確認 Public_Data 部署與目前資料環境一致。不會以缺失名單推估持股或訊號。');if(quantStrategyMode==='momentum')return header+card('動能趨勢',facts(Object.fromEntries((d.alpha_allocation||[]).map(item=>[`${item.strategy} 權重`,Number.isFinite(item.weight)?`${n(item.weight*100)}%`:'資料不足'])))+status('個股趨勢名單資料不足','canonical 來源目前只提供策略權重，未提供可核對的逐股趨勢分類；不以當日漲幅代替趨勢訊號。'));if(quantStrategyMode==='dividend')return header+status('股利殖利率資料不足','量化來源未提供與原始行情同日期的逐股殖利率；不以未對齊的股利事件推算排名。');if(quantStrategyMode==='value'){const rows=eligible.flatMap(item=>{const quote=state.rows.find(row=>row.symbol===item.stock);return quote&&Number.isFinite(item.pe_ratio)&&item.pe_ratio>0?[{...quote,pe:item.pe_ratio,score:Number.isFinite(item.score)?item.score:null,weight:Number.isFinite(item.weight)?item.weight*100:null}]:[];});return header+card('低估值・模型名單內本益比排序','<p class="muted">依來源正本益比排序，僅涵蓋模型名單；估值資料與最新行情日期可能不同，不代表即時估值。</p>')+(rows.length?rowList(rows,'quant.value'):status('估值資料不足','來源模型名單沒有目前有效且具正本益比的證券。'));}const rows=quantRows(items,state.rows);return header+`<div class="toolbar" role="group" aria-label="量化名單">${[['all','全部'],['held','模型持有'],['candidate','候選名單']].map(([value,label])=>`<button type="button" data-quant-mode="${value}" aria-pressed="${quantSelection===value}" class="${quantSelection===value?'primary':''}">${label}</button>`).join('')}</div>`+(rows.length?rowList(rows,'quant'):status('此分類目前沒有可顯示個股','來源名單無符合目前有效上市證券與原始行情的資料。'));}
  if(id==='rankings')return marketTabs(id)+card('行情排序',`<p class="muted">實際漲跌幅只在來源提供交易所參考價時顯示。沒有參考價時顯示資料不足，可改依成交量或成交金額排序。</p>`)+rowList(state.rows,'rankings');
  if(['institutional','quick-filter'].includes(id)){
   const quick=id==='quick-filter',d=await publicData(quick?'quant/rapid_screen.json':'quant/institutional_leaderboard.json');
   const normalized=normalizedInstitutional(d.stocks??d.sectors?.flatMap(s=>s.stocks.map(x=>({...x,sector_tag:s.display_tag??s.sector_tag})))??[],quick);
   const seenFlow=new Set();
   const items=normalized.filter(x=>{if(seenFlow.has(x.stock_id))return false;seenFlow.add(x.stock_id);return true;}).filter(x=>resolveListingStatus(x.stock_id,taipeiDay(),state.listing).eligible&&(!quick||minimumBuyDays===0||Number.isFinite(x.buy_days)&&x.buy_days>=minimumBuyDays)&&Number.isFinite(x.institutionalNet)&&x.institutionalNet>=(quick?minimumLots:0)&&(!flowQuery||`${x.name??''} ${x.stock_id} ${x.sector_tag??''}`.toLowerCase().includes(flowQuery.toLowerCase())));
   items.sort((a,b)=>b.institutionalNet-a.institutionalNet||compareCodepoints(a.stock_id,b.stock_id));
   const source=quick?'combined':institutionalSource;
   const rows=items.map(x=>{const q=state.rows.find(r=>r.symbol===x.stock_id)??identity(x.stock_id,{name:x.name},state.listing.stocks[x.stock_id]);return {...q,institutionalNet:source==='combined'?x.institutionalNet:q[{foreign:'foreignNet',trust:'trustNet',dealer:'dealerNet'}[source]],trackingDays:x.trackingDays,buyDays:x.buyDays};});
   const known=rows.filter(r=>Number.isFinite(r.institutionalNet));
   const points=source==='combined'?flowSeries(items,from,to):known.length?[{date:state.index.latest_daily_tw,value:known.reduce((s,r)=>s+r.institutionalNet,0)}]:[];
   const sourceNames={combined:'外資＋投信',foreign:'外資',trust:'投信',dealer:'自營商'};
   const controls=quick?`<form id="quick-buy-filter" class="toolbar"><label>名稱、代號或產業<input name="query" value="${e(flowQuery)}"></label><label>最低累積買超張數<input name="lots" type="number" min="0" step="any" value="${minimumLots}" required></label><label>區間至少買超天數<input name="days" type="number" min="0" max="${d.window_days||10}" value="${minimumBuyDays}" required></label><button class="primary">套用條件</button></form>`:`<form id="institutional-search" class="toolbar"><label>名稱、代號或產業<input name="query" value="${e(flowQuery)}"></label><button>搜尋</button></form><div class="toolbar" role="group" aria-label="法人來源">${Object.entries(sourceNames).map(([value,label])=>`<button data-research-source="${value}" aria-pressed="${source===value}" class="${source===value?'primary':''}">${label}</button>`).join('')}</div>`;
   const mobileDetails=items.length&&source==='combined'&&matchMedia('(max-width:1099px)').matches?items.map((item,i)=>card('個股追蹤',rowList([rows[i]],id)+facts({'起始日期':item.start_date??item.flow?.[0]?.date??'來源日期不足','來源訊號':item.latest_signal??item.label??'資料不足','產業':item.sector_tag??'資料不足'})+flowChart(flowSeries([item]).slice(-30),`${rows[i].name} ${rows[i].symbol}`))).join(''):rowList(rows,id);
   return controls+card(quick?'短期快篩條件':'統計期間',facts({'法人資料日期':source==='combined'?d.date:state.index.latest_daily_tw,'現價資料日期':state.index.latest_daily_tw,'統計範圍':source==='combined'?'本頁已確認上市之追蹤名單':'本頁名單之最新單日行情','來源':sourceNames[source],'單位':'張（1 張＝1,000 股）'})+(source==='combined'?`<form id="institutional-range" class="toolbar"><label>圖表起日<input type="date" name="from" value="${e(from)}"></label><label>圖表迄日<input type="date" name="to" value="${e(to)}"></label><button>套用圖表期間</button></form>`:'<p class="muted">分項來源只有最新單日；沒有分項歷史序列，不以合計冒充分項。</p>'))+card(`${sourceNames[source]}淨買賣超（張）`,flowChart(points)+`<p class="muted">名單合計，不是全市場法人金額。${quick?'原始來源為股，已除以 1,000 換算張；買超天數不代表連續買超。':'追蹤天數不是連續買超天數。累積數值依各股追蹤起日，不因圖表期間更動。'}</p>`)+mobileDetails;
  }
  if(id==='sector-pe'){
   const d=await publicData('quant/sector_pe.json'),sectors=d.sectors??[],group=sectors.find(s=>s.sector_tag===selectedSector)??sectors[0];if(!group)return status('尚無族群資料','資料來源未提供族群。');
   const members=(group.stocks??[]).filter(r=>state.rows.some(x=>x.symbol===r.stock_id));
   const rows=members.map(x=>({...state.rows.find(r=>r.symbol===x.stock_id),pe:Number.isFinite(x.pe_ratio)?x.pe_ratio:null,eps:Number.isFinite(x.eps)?x.eps:null}));
   const valid=rows.filter(x=>x.pe>0);
   return card('市場主題族群',`<label>選擇族群<select id="sector-select">${sectors.map(s=>`<option value="${e(s.sector_tag)}" ${s.sector_tag===group.sector_tag?'selected':''}>${e(s.display_tag||s.sector_tag)}</option>`).join('')}</select></label><p class="muted">使用來源 market_theme 分組，不將市場主題誤標為官方產業分類。</p>`)+card(group.display_tag||group.sector_tag,facts({'本益比中位數（目前合格成員）':median(valid.map(r=>r.pe)),'有效樣本':valid.length,'缺值或非正本益比':rows.length-valid.length,'本益比資料日期':d.date,'現價資料日期':state.index.latest_daily_tw,'分類版本':group.taxonomy_version??d.schema_version}))+card('成分股',rowList(rows,'sector-pe'));
  }
  if(id==='themes'){
   const result=await optionalCanonicalData('quant/sector_pe.json');if(result.missing)return status('族群資料不足','讀取 quant/sector_pe.json 回應 404；請確認 Public_Data 部署與目前資料環境一致。','◇');const data=result.data;
   const groups=filterThemeGroups(data.sectors,themeQuery,symbol=>resolveListingStatus(symbol,taipeiDay(),state.listing).eligible),selected=chooseThemeGroup(groups,themeSelected);themeSelected=selected?.group.sector_tag??'';
   const options=groups.map(({label,group})=>`<option value="${e(group.sector_tag)}" ${group.sector_tag===themeSelected?'selected':''}>${e(label)}</option>`).join('');
   const selector=groups.length?`<label class="theme-group-picker">族群分頁<select name="theme" aria-label="族群分頁">${options}</select></label>`:'';
   const selectedCard=selected?card(selected.label,`<p>來源樣本 ${e(selected.group.stock_count??'資料不足')} 檔；符合篩選 ${selected.members.length} 檔。以單一族群分頁呈現，避免手機頁面同時展開全市場族群。</p>${rowList(selected.members.map(stock=>({...state.rows.find(r=>r.symbol===stock.stock_id),...identity(stock.stock_id,{name:stock.name},state.listing.stocks[stock.stock_id]),pe:Number.isFinite(stock.pe_ratio)?stock.pe_ratio:null,eps:Number.isFinite(stock.eps)?stock.eps:null})),'sector-pe')}`):status('沒有符合的族群','調整搜尋條件後重試。');
   return card('族群搜尋',`${selector}<form id="theme-search" class="toolbar"><label>族群、股票名稱或代號<input type="search" name="query" value="${e(themeQuery)}"></label><button class="primary">搜尋</button><button type="button" data-theme-clear>清除</button></form><p class="muted">來源市場主題分組，不等同官方產業分類。資料日期：${e(data.date??'日期不足')}</p><p role="status">符合 ${groups.length} 個族群${selected?`・目前：${e(selected.label)}`:''}</p>`)+selectedCard;
  }
  if(id==='scanner'){
   const rows=filterScannerRows(state.rows,scannerApplied);
   const numeric=(key,label)=>`<label>${label}<input name="${key}" type="text" inputmode="decimal" value="${e(scannerDraft[key])}" placeholder="不限制"></label>`;
   const tabs=[['factors','因子選股'],['patterns','型態選股'],['advanced','進階條件']];
   const tabBar=`<div class="toolbar scanner-tabs" role="tablist" aria-label="篩選模式">${tabs.map(([id,label])=>`<button type="button" role="tab" data-scanner-tab="${id}" aria-selected="${scannerTab===id}" class="${scannerTab===id?'primary':''}">${label}</button>`).join('')}</div>`;
   const market=`<label>市場<select name="market">${[['','全部'],['TWSE','上市'],['TPEX','上櫃']].map(([v,label])=>`<option value="${v}" ${scannerDraft.market===v?'selected':''}>${label}</option>`).join('')}</select></label>`;
   const unavailable=(title,items)=>`<fieldset disabled aria-label="${title}"><legend>${title}・資料不足</legend>${items.map(item=>`<label><input type="checkbox">${item}</label>`).join('')}<p class="muted">canonical 全市場來源尚未提供可核對的完整欄位；缺值不會當成通過條件，也不生成推測結果。</p></fieldset>`;
   const identity=`<label>名稱、代號或產業<input name="query" type="search" value="${e(scannerDraft.query)}"></label>`;
   const groups=scannerTab==='factors'?`${market}${unavailable('基本面因子',['本益比區間','EPS 正負值','股息殖利率'])}${unavailable('技術面因子',['20 日均線多頭排列','60 日成交量大於均量 1.5 倍'])}${unavailable('籌碼面因子',['外資連續買超','投信連續買超'])}`:scannerTab==='patterns'?`${unavailable('型態條件',['突破整理平台','帶量長紅','W 底'])}<p class="muted">批次型態掃描需最新 stocks.json 現行名冊與有界 canonical 個股 K 線清單；目前來源條件不足，不推測完成數或候選股。</p><a class="directory-link" href="#/patterns"><span>開啟型態雷達</span><span>›</span></a>`:`${market}<fieldset><legend>進階行情條件・目前可用</legend>${numeric('minPrice','最低原始市價')}${numeric('maxPrice','最高原始市價')}${numeric('minVolume','最低成交量（股）')}</fieldset>${unavailable('進階資料條件',['基本面／技術面／籌碼條件組合'])}`;
   return card('股票篩選',`${tabBar}<form id="screen-form" class="stack" novalidate>${identity}${scannerTab==='patterns'?`<input type="hidden" name="market" value="${e(scannerDraft.market)}">`:''}${scannerTab!=='advanced'?`<input type="hidden" name="minPrice" value="${e(scannerDraft.minPrice)}"><input type="hidden" name="maxPrice" value="${e(scannerDraft.maxPrice)}"><input type="hidden" name="minVolume" value="${e(scannerDraft.minVolume)}">`:''}${groups}<div class="toolbar"><button class="primary" type="submit">套用條件</button><button type="button" data-scanner-clear>清除條件</button></div><p id="scanner-error" role="status" class="${scannerError?'alert':'muted'}">${e(scannerError||'空白表示不限制；結果使用已套用條件。')}</p></form><p class="muted">只顯示已確認上市的證券。市價使用原始價格，成交量單位為股；啟用數值條件時排除該欄缺值。</p>`)+`<div id="screen-results"><p role="status">符合 ${rows.length} 檔</p>${rowList(rows,'scanner')}</div>`;
  }
  if(id==='simulation')return card('模擬條件',`<form id="scenario-form" class="stack"><label for="scenario-initial">初始投入金額</label><input id="scenario-initial" name="initial" type="number" min="0" step="any" value="1000000" required aria-describedby="scenario-status"><label for="scenario-monthly">每月投入金額</label><input id="scenario-monthly" name="monthly" type="number" min="0" step="any" value="10000" required aria-describedby="scenario-status"><label for="scenario-years">模擬期間（年）</label><input id="scenario-years" name="years" type="number" min="1" max="30" step="1" value="5" required aria-describedby="scenario-status"><button class="primary">計算情境</button><p id="scenario-status" role="status" class="muted"></p></form><p class="muted">固定年報酬 4%、8%、12%，每月底投入；未扣稅費與通膨。此為數學情境，不是預測或實際績效。</p><div id="scenario-results" aria-live="polite"></div>`);
  if(id==='briefing'){
   const d=await publicData('audio_summaries/show_summaries.json');
   const episodes=(d.episodes??[]).slice().sort((a,b)=>String(b.publish_date).localeCompare(String(a.publish_date)));
   const dates=uniquePublishDates(episodes);
   if(!dates.includes(briefingDate)){briefingDate=dates[0]??'';briefingIndex=0;}
   const summaryDates='<label class="briefing-date-select">摘要日期<select id="briefing-date" aria-label="摘要日期" '+(dates.length?'':'disabled')+'>'+(dates.length?dates.map(date=>'<option value="'+e(date)+'" '+(date===briefingDate?'selected':'')+'>'+e(date)+'</option>').join(''):'<option>資料不足</option>')+'</select></label>';
   const selectedEpisodes=episodes.filter(x=>x.publish_date===briefingDate);
   const allHighlights=selectedEpisodes.flatMap(episode=>(episode.ai_summary?.key_data??[]).map(text=>({episode,text})));
   const highlights=briefingShowAll?allHighlights:allHighlights.slice(0,5);
   if(briefingIndex>=highlights.length)briefingIndex=0;
   const visibleHighlights=highlights;
   const focusRows=visibleHighlights.map((item,index)=>'<button type="button" class="briefing-headline" data-briefing-headline="'+index+'" aria-pressed="'+String(index===briefingIndex)+'"><span class="briefing-headline-number">'+(index+1)+'</span><span>'+e(item.text)+'</span></button>').join('');
   const focus=highlights.length?card('今日焦點','<div class="briefing-focus-heading"><span>今日焦點</span><button type="button" data-briefing-show-all>'+ (briefingShowAll?'收合':'查看全部') +' ›</button></div><div class="briefing-focus-list">'+focusRows+'</div>'):status('今日焦點資料不足','Public_Data 此日期沒有可呈現的摘要重點。');
   let summary=status('摘要內容資料不足','所選日期沒有可閱讀的節目摘要。');
   if(highlights.length){
    const current=highlights[briefingIndex],episode=current.episode,summaryData=episode.ai_summary||{};
    const sourceURL=briefingSourceLink(episode);
    const targets=(summaryData.core_targets??[]).filter(text=>typeof text==='string'&&text.trim()).map(e).join('、')||'資料不足。';
    const positive=(summaryData.bullish_points??[]).map(text=>'<p>'+e(text)+'</p>').join('')||'<p class="muted">來源未提供。</p>';
    const risks=(summaryData.bearish_points??[]).map(text=>'<p>'+e(text)+'</p>').join('')||'<p class="muted">來源未提供。</p>';
    const advice=typeof summaryData.trading_advice==='string'&&summaryData.trading_advice.trim()?'<p>'+e(summaryData.trading_advice)+'</p>':'<p class="muted">資料不足。</p>';
    summary=card('摘要內容','<div class="briefing-summary-pager"><button type="button" data-briefing-step="-1" aria-label="上一則摘要" '+(briefingIndex===0?'disabled':'')+'>‹</button><strong aria-live="polite">'+(briefingIndex+1)+'/'+highlights.length+'</strong><button type="button" data-briefing-step="1" aria-label="下一則摘要" '+(briefingIndex>=highlights.length-1?'disabled':'')+'>›</button></div><h3>'+e(current.text)+'</h3><p class="muted">'+e(episode.show_name||'節目名稱不足')+'・'+e(episode.publish_date)+'</p><details><summary>完整節目摘要</summary><h3>摘要提及對象</h3>'+targets+'<h3>正面觀察</h3>'+positive+'<h3>風險觀察</h3>'+risks+'<h3>來源建議</h3>'+advice+'</details><div class="briefing-summary-source"><span>來源與資料</span><p>內容依 Public_Data 節目摘要整理；請以來源節目為準。</p>'+sourceURL+'</div>');
   }
   return m25Tabs('briefing')+card('財經節目摘要','<p>來源更新：'+e(d.last_updated??'資料日期不足')+'</p>'+summaryDates)+focus+summary;
  }
  if(id==='fx'){
   fxData=await publicData('meta/exchange_rate_history.json');const rows=validFxRows(fxData.data||[],taipeiDay()).sort((a,b)=>a.date.localeCompare(b.date)),latest=rows.at(-1);if(!latest)return status('尚無匯率資料','請同步後重試。');
   const currencies=(fxData.currencies||[]).filter(c=>c.endsWith('_TWD'));
   const previous=rows.length>1?rows.at(-2):null,change=Number.isFinite(latest.USD_TWD)&&Number.isFinite(previous?.USD_TWD)?latest.USD_TWD-previous.USD_TWD:null,changePct=change!==null&&previous.USD_TWD>0?change/previous.USD_TWD*100:null;
   const ranges=[['1w','1週'],['1m','1月'],['3m','3月'],['1y','1年']];
   const trend=`<div class="metric-grid fx-quote"><div class="metric"><small>TWD/USD・新臺幣／美元</small><strong class="hero-value"><span class="sr-only">來源 USD/TWD，每 1 美元兌新臺幣 </span>${fxRateDisplay(latest.USD_TWD)}</strong></div><div class="metric fx-change"><strong>${change===null?'資料不足':`${change>=0?'+':''}${n(change,3)}`}</strong><span>${changePct===null?'':`${changePct>=0?'+':''}${n(changePct,2)}%`}</span></div></div><p class="muted">來源資料日：${e(latest.date)}・更新時間：${e(fxData.updated_at??'來源日期不足')}・僅供參考，非即時行情</p><div class="toolbar fx-range" role="group" aria-label="匯率歷史區間">${ranges.map(([value,label])=>`<button type="button" data-fx-range="${value}" aria-pressed="${value===fxRange}" class="${value===fxRange?'primary':''}">${label}</button>`).join('')}</div><div id="fx-trend-chart">${fxTrendChart(fxRangePoints(rows,fxRange))}</div>`;
   const names={TWD:'新臺幣',USD:'美元',JPY:'日圓',EUR:'歐元',KRW:'韓元',AUD:'澳幣',THB:'泰銖',HKD:'港幣',CNY:'人民幣',VND:'越南盾',MYR:'馬幣',IDR:'印尼盾',GBP:'英鎊'},flags={TWD:'🇹🇼',USD:'🇺🇸',JPY:'🇯🇵',EUR:'🇪🇺',KRW:'🇰🇷',AUD:'🇦🇺',THB:'🇹🇭',HKD:'🇭🇰',CNY:'🇨🇳',VND:'🇻🇳',MYR:'🇲🇾',IDR:'🇮🇩',GBP:'🇬🇧'};
   const currencySelect=(name,selected,label)=>{const short=selected.replace('_TWD','');return '<label class="fx-currency-select"><span class="fx-flag" aria-hidden="true">'+(flags[short]||'🌐')+'</span><span class="fx-currency-copy"><strong>'+e(short)+'</strong><small>'+e(names[short]||short)+'</small></span><select name="'+name+'" aria-label="'+label+'">'+currencies.map(code=>{const symbol=code.replace('_TWD','');return '<option value="'+e(code)+'" '+(code===selected?'selected':'')+'>'+(flags[symbol]||'🌐')+' '+e(names[symbol]||symbol)+' ('+e(symbol)+')</option>';}).join('')+'</select><span class="fx-select-chevron" aria-hidden="true">⌄</span></label>';};
   const initial=fxConversion(1000,latest.TWD_TWD,latest.USD_TWD),initialResult=initial===null?'資料不足':new Intl.NumberFormat('zh-TW',{maximumFractionDigits:2}).format(initial);
   const cacheURL=new URL('../../data/meta/exchange_rate_history.json',location.href).href;let cacheStatus='尚未建立本機快取';
   if('caches'in window){try{const cached=await caches.match(cacheURL);if(cached){const payload=await cached.json(),cachedRows=validFxRows(payload.data||[],taipeiDay());if(cachedRows.length){const cachedDate=cachedRows.at(-1).date;cacheStatus=state.offline?'目前使用離線快取（截至 '+cachedDate+'）':cachedDate===latest.date?'已保存離線資料（'+cachedRows.length+' 筆）':'已有較舊離線快取（截至 '+cachedDate+'）';}}}catch{}}
   const reference='<div class="fx-reference"><span>參考匯率 1 USD = '+fxRateDisplay(latest.USD_TWD)+' TWD</span><span>更新時間<br>'+e(latest.date)+' '+e((fxData.updated_at||'').replace('T',' ').slice(0,16))+'</span></div>';
   const converter='<div class="fx-converter-heading"><h3>貨幣換算</h3><button type="button" data-fx-swap aria-label="交換換算幣別" title="交換換算幣別">⇄</button></div><form id="fx-form" class="fx-converter" novalidate><div class="fx-converter-row">'+currencySelect('from','TWD_TWD','原幣別')+'<input name="amount" type="number" min="0" step="any" value="1000" aria-label="換算金額"></div><div class="fx-converter-row">'+currencySelect('to','USD_TWD','目標幣別')+'<output id="fx-result" class="fx-converter-output" role="status" aria-live="polite">'+initialResult+'</output></div></form>'+reference+'<p class="fx-info"><span aria-hidden="true">ⓘ</span>此匯率為示意資料，非銀行報價，僅供參考。</p>';
   const cacheCard='<div class="fx-cache-row"><strong>'+cacheStatus+'</strong><span>來源資料日：'+e(latest.date)+'・更新時間：'+e(fxData.updated_at??'來源日期不足')+'</span></div>';
   return m25Tabs('fx')+card('TWD/USD 匯率走勢',trend)+card('',converter)+card('快取狀態',cacheCard);
  }
  return null;
 }
 async function detail(id,symbol,row){
  if(id==='company'){
   let source=null,sourceIssue='';
   try{source=await publicData(`stocks/${encodeURIComponent(symbol)}.json`);}catch(error){sourceIssue=error?.message||'Public_Data 個股基本資料暫不可用。';}
   if(source&&source.stock_id!==symbol){sourceIssue='來源資料代號與目前選取證券不同。';source=null;}
   let officialProfile=null;try{officialProfile=(await publicData('meta/company_sources.json'))?.[symbol]??null;}catch{}
   const summary=companyBusinessSummary(officialProfile);
   const summaryDate=officialProfile?.business_summary_retrieved_at;
   const summaryMeta=summaryDate?`<p class="muted">官方業務資料擷取時間：${e(summaryDate)}</p>`:'';
   const basicFacts=facts(companyProfileFacts(symbol,row,source,state.listing));
   return card(`${row.name||symbol} ${symbol}・公司基本資料`,basicFacts+officialCompanyProfileLinks(officialProfile)+(sourceIssue?status('個股補充資料暫不可用',sourceIssue):''))+
    (summary?card('公司簡介',`<p>${e(summary)}</p>${summaryMeta}`):status('公司簡介資料不足','Public_Data 官方公司基本資料目前未提供主要經營業務；不依產業名稱推測公司業務。'));
  }
  if(['fair-value','valuation-evidence'].includes(id)){
   const manifest=await publicData('valuation/fair_value_v2_1_sharded/manifest.json');
   const shard=manifest.symbol_to_shard?.[symbol];
   if(typeof shard!=='string'||!/^shard-\d{3}\.json\.gz$/.test(shard))return status('公允價值資料不足','估值 manifest 未列出此證券的明細分片。');
   const payload=await publicData(`valuation/fair_value_v2_1_sharded/${shard}`),value=payload.stocks?.[symbol];
   if(!value||value.symbol!==symbol)return status('公允價值來源身份不符','分片中沒有所選證券的估值資料。');
   const explanation=value.fair_value_explanation;
   const summary=typeof explanation==='string'?explanation:explanation?.summary;
   const available=value.status==='ok'&&Number.isFinite(value.fair_value)&&value.production_publishable!==false&&!(value.hard_fail_flags?.length);
   const block=value.production_publish_block_reason||value.reason_code||value.data_status||'目前沒有通過來源發布閘門的估值資料。';
   const upside=value.upside??explanation?.upside_downside_pct;
   const overview=facts({'發布狀態':available?'可發布':'不可發布','公允價值（元／股）':available?value.fair_value:null,'估值來源參考市價（元／股）':value.market_price,'上／下行幅度（%）':Number.isFinite(upside)?upside*100:null,'模型版本':value.model_version??value.model,'報告期間':value.reported_period,'來源資料日':value.as_of,'行情來源日':value.source_dates?.price,'財報來源日':value.source_dates?.financials,'月營收來源日':value.source_dates?.monthly_revenue,'模型數':value.model_count,'估值家族':(value.families_used||explanation?.families_used||[]).join('、')});
   const blocked=available?'':status('公允價值不可發布',String(block),'!');
   const note=summary?`<p>${e(summary)}</p>`:'';
   const overviewPanel=card('估值狀態',overview+blocked+note+'<p class="muted">估值是模型估計，不保證未來價格；參考市價與來源日期沿用估值資料本身，不代替目前原始行情。</p>')+(available?card('公允價值區間・模型估計',valuationRange(value)):'');
   if(id==='fair-value')return overviewPanel;
   const inputs=value.inputs||{};
   const inputsPanel=card('模型輸入參數',facts({'TTM EPS（元）':inputs.ttm_eps,'報導 EPS（元）':inputs.reported_ttm_eps,'估值 EPS（元）':inputs.valuation_eps,'預估 EPS（元）':inputs.forecast_eps,'2027 預估 EPS（元）':inputs.forward_eps_2027,'2028 預估 EPS（元）':inputs.forward_eps_2028,'成本權益 %':Number.isFinite(inputs.cost_of_equity)?inputs.cost_of_equity*100:null,'終端成長 %':Number.isFinite(inputs.terminal_growth)?inputs.terminal_growth*100:null,'同業中位 PE':inputs.peer_median_pe,'同業中位 PB':inputs.peer_median_pb})+`<p class="muted">模型來源日期：價格 ${e(value.source_dates?.price??'資料不足')}・財報 ${e(value.source_dates?.financials??'資料不足')}・營收 ${e(value.source_dates?.monthly_revenue??'資料不足')}</p>`);
   const contributions=explanation?.model_contributions||explanation?.valuation_basis||[];
   const modelsPanel=available&&contributions.length?contributions.map(item=>card(item.model_name||item.model||'估值模型',facts({'模型家族':item.family,'估值（元／股）':item.value,'是否納入':item.eligible===true?'是':item.eligible===false?'否':'資料不足','信心分數':item.confidence,'模型權重':item.weight,'驗證狀態':item.validation_status??item.validation?.status,'排除原因':item.reason_if_excluded??item.reason}))).join(''):status('沒有可呈現的模型貢獻',available?'來源未附模型貢獻明細。':String(block));
   const drivers=[...(explanation?.positive_drivers||[]),...(explanation?.negative_drivers||[])];
   const driversPanel=available&&drivers.length?drivers.map(item=>card(item.description_zh??item.description??item.type??'估值驅動因素',facts({'方向':item.direction,'來源數值':item.value,'類型':item.type}))).join(''):status('沒有可呈現的驅動因素',available?'來源未附驅動因素。':String(block));
   const quality=explanation?.data_quality||{},qualityItems=[...new Set([...(quality.missing_inputs||[]),...(quality.warnings||[]),...(value.warnings||[]),...(value.review_required_flags||[]),...(value.hard_fail_flags||[])])];
   const qualityPanel=card('資料品質與發布限制',facts({'內在估值信心':explanation?.intrinsic_valuation_confidence,'同業樣本數':quality.peer_sample_size,'模型家族數':quality.model_family_count,'前瞻 EPS 可用':quality.forward_eps_available===true?'是':quality.forward_eps_available===false?'否':null,'前瞻營收可用':quality.forward_revenue_available===true?'是':quality.forward_revenue_available===false?'否':null,'月營收可用':quality.monthly_revenue_available===true?'是':quality.monthly_revenue_available===false?'否':null,'可發布':available?'是':'否'})+(qualityItems.length?qualityItems.map(item=>`<p>${e(item)}</p>`).join(''):status('來源未列資料品質警示','此處不代表已完成獨立研究認證。')));
   const publishNotice=available?'':status('估值不可發布',String(block),'!');
   const tabs=[['overview','概覽',overviewPanel],['inputs','輸入',publishNotice+inputsPanel],['models','模型',publishNotice+modelsPanel],['drivers','驅動',publishNotice+driversPanel],['quality','品質',qualityPanel]];
   return renderValuationEvidenceTabs(symbol,tabs);
  }
  if(id==='fund')return fundInformation(ctx,symbol,row);
  if(id==='news')return newsPage.page(symbol,row);
  if(['flows','margin'].includes(id))return flowHistory.page(id,symbol,row);
  if(id==='constituents'&&matchMedia('(min-width:1100px)').matches)return desktop.etf(symbol,row);
  if(id==='constituents')return quarterlyETFDisclosure(ctx,symbol);
  if(['revenue','earnings','dividends'].includes(id))return periodHistory(ctx,id,symbol,row);
  if(id==='etf-performance'){
   const dividends=await periodHistory(ctx,'dividends',symbol,row).catch(error=>status('配息紀錄暫不可用',error.message,'↗',true));
   const eligible=resolveListingStatus(symbol,taipeiDay(),state.listing).eligible;
   let historyRows=[],historyFailure='',navRows=[],navFailure='';
   if(eligible){try{historyRows=decodeETFRawHistory(await publicData(`rebuild/charts/${encodeURIComponent(symbol)}.json`),symbol);}catch(error){historyFailure=error.message;}}
   if(eligible&&['TPEX','TWSE'].includes(String(row.market).toUpperCase())){try{navRows=decodeETFNavHistory(await publicData(`rebuild/etf-nav/${encodeURIComponent(symbol)}.json`),symbol);}catch(error){navFailure=error.message;}}
   const ranges=availableETFHistoryRanges(historyRows),rangeNames=Object.fromEntries([['oneYear','1年'],['threeYears','3年'],['fiveYears','5年'],['all','全部']]);
   let selected=state.etfHistoryRange||'oneYear';if(!ranges.some(([id])=>id===selected))selected=ranges.some(([id])=>id==='oneYear')?'oneYear':'all';state.etfHistoryRange=selected;
   const controls=`<div class="etf-history-ranges" role="group" aria-label="ETF 價格與淨值歷史期間">${[['oneYear','1年'],['threeYears','3年'],['fiveYears','5年'],['all','全部']].map(([id,label])=>{const enabled=ranges.some(([key])=>key===id);return `<button type="button" data-etf-history-range="${id}" aria-pressed="${selected===id}" aria-label="${label}${enabled?'':'，資料不足'}" ${enabled?'':'disabled'}>${label}</button>`;}).join('')}</div>`;
   const selectedRows=filterETFHistoryRange(historyRows,selected);
   let trend=historyRows.length?status('ETF 歷史價格序列不足','Public_Data canonical raw chart 沒有足夠的有效點。'):status('ETF 歷史價格資料不足',eligible?(historyFailure||'Public_Data 尚未提供此 ETF 可驗證的 per-symbol raw chart。'):'上市資格尚未確認；資格未通過前不載入 ETF 行情。');
   if(selectedRows.length){
    const closes=selectedRows.map(x=>x.close),lo=Math.min(...closes),hi=Math.max(...closes),span=hi-lo||Math.max(Math.abs(hi)*.002,.01),x=i=>50+i/(selectedRows.length-1||1)*560,y=value=>174-(value-(lo-span*.08))/(span*1.16)*132,coords=selectedRows.map((point,i)=>`${x(i).toFixed(1)},${y(point.close).toFixed(1)}`).join(' '),area=`${x(0)},174 ${coords} ${x(selectedRows.length-1)},174`,movement=closes.at(-1)-closes[0],color=movement>0?'var(--up)':movement<0?'var(--down)':'var(--muted)';
    trend=card(`Public_Data raw 市價・${rangeNames[selected]}`,`<svg class="chart etf-history-chart" viewBox="0 0 660 218" role="img" aria-label="${e(row.name||symbol)} ${e(symbol)} ${rangeNames[selected]}原始收盤價，${e(selectedRows[0].date)} 至 ${e(selectedRows.at(-1).date)}，${selectedRows.length}筆"><line x1="50" x2="610" y1="42" y2="42" stroke="var(--line)"/><line x1="50" x2="610" y1="108" y2="108" stroke="var(--line)"/><line x1="50" x2="610" y1="174" y2="174" stroke="var(--line)"/><text x="46" y="46" text-anchor="end">${n(hi)}</text><text x="46" y="178" text-anchor="end">${n(lo)}</text><polygon points="${area}" fill="${color}" fill-opacity=".16"/><polyline points="${coords}" fill="none" stroke="${color}" stroke-width="2.5"/><text x="50" y="199">${e(selectedRows[0].date)}</text><text x="610" y="199" text-anchor="end">${e(selectedRows.at(-1).date)}</text></svg>${facts({'最新原始收盤':closes.at(-1),'有效交易日數':selectedRows.length,'行情資料日期':selectedRows.at(-1).date})}<p class="muted">raw close・Public_Data rebuild/charts/${e(symbol)}.json・不代表含息總報酬。</p>`);
   }
   const cutoff=selectedRows.at(-1)?.time-(rangeNames[selected]==='1年'?365.2425:rangeNames[selected]==='3年'?3*365.2425:rangeNames[selected]==='5年'?5*365.2425:Infinity)*86400;
   const selectedNav=navRows.filter(point=>selected==='all'||point.time>=cutoff);
   let navTrend;
   if(selectedNav.length){
    const values=selectedNav.map(point=>point.value),lo=Math.min(...values),hi=Math.max(...values),span=hi-lo||Math.max(Math.abs(hi)*.002,.01),x=i=>50+i/(selectedNav.length-1||1)*560,y=value=>145-(value-(lo-span*.08))/(span*1.16)*110,coords=selectedNav.map((point,i)=>`${x(i).toFixed(1)},${y(point.value).toFixed(1)}`).join(' '),color=values.at(-1)>values[0]?'var(--up)':values.at(-1)<values[0]?'var(--down)':'var(--muted)';
    const navSource=row.market==='TWSE'?'MOPS／TWSE 官方':'TPEx 官方 ETF 產品資料';
    const navCurrency=selectedNav.at(-1).currency||'TWD';
    navTrend=card(`${navSource}每日淨值・${rangeNames[selected]}`,`<svg class="chart etf-history-chart" viewBox="0 0 660 190" role="img" aria-label="${e(row.name||symbol)} ${e(symbol)} ${e(navSource)}每日淨值，${e(selectedNav[0].date)} 至 ${e(selectedNav.at(-1).date)}，${selectedNav.length}筆"><line x1="50" x2="610" y1="35" y2="35" stroke="var(--line)"/><line x1="50" x2="610" y1="90" y2="90" stroke="var(--line)"/><line x1="50" x2="610" y1="145" y2="145" stroke="var(--line)"/><text x="46" y="39" text-anchor="end">${n(hi)}</text><text x="46" y="149" text-anchor="end">${n(lo)}</text><polyline points="${coords}" fill="none" stroke="${color}" stroke-width="2.5"/><text x="50" y="174">${e(selectedNav[0].date)}</text><text x="610" y="174" text-anchor="end">${e(selectedNav.at(-1).date)}</text></svg>${facts({'最新官方 NAV':`${n(values.at(-1))} ${navCurrency}`,'有效淨值日數':selectedNav.length,'淨值資料日期':selectedNav.at(-1).date})}<p class="muted">來源：${e(navSource)}・Public_Data・幣別 ${e(navCurrency)}／受益權單位。NAV 是盤後基金淨值，不是盤中 iNAV；只畫實際發布日期，不插值。</p>`);
   }else navTrend=status('ETF 官方淨值資料不足',eligible?(navFailure||'Public_Data 尚未提供可驗證的每日 NAV 序列。'):'上市資格尚未確認；資格未通過前不載入 ETF 淨值。');
   const history=card('歷史績效趨勢・價格／淨值',controls+trend+navTrend);
   let data,p;try{data=await publicData('quant/etf/outputs/etf_year_performance.json');p=etfPerformanceView(data,symbol);}catch(error){return history+status('ETF績效暫不可用',error.message,'↗',true)+dividends;}
   if(!p)return history+status('尚無ETF期間報酬','資料來源沒有此基金的績效紀錄。')+dividends;
   const r=p.row;return history+card(`${r.etf_name||row.name} ${symbol} · 期間報酬`,facts({'觀察起日':r.first_date,'觀察迄日':r.latest_date,'報酬尺度':p.basis,'區間報酬':p.datesValid&&p.returnValue!==null?`${n(p.returnValue)}%`:'資料不足','原始首日收盤':r.first_close,'原始末日收盤':r.latest_close,'報酬資料日期':data.date}))+card('績效說明','<p>報酬直接取用來源指定的價格尺度；原始首末收盤僅供行情參考，不用它們重新計算還原報酬。此處不是年化報酬，也未驗證為股息再投資總報酬。</p><p class="muted">配息紀錄依來源日期另列；不將還原價格報酬標為含息報酬。</p>')+dividends;
  }
  if(id==='rebalance'){
   const data=await publicData('rebuild/etf-comparison.json');
   if(data.schemaVersion!==2||data.unit!=='percentage_points'||!(data.baseDate<data.date))throw Error('ETF比較資料契約不符合');
   const fund=data.funds.find(x=>x.symbol===symbol);if(!fund)return status('尚無成分比較資料','需要此基金兩份可比較的來源快照。');
   const rows=fund.rows.filter(x=>resolveListingStatus(x.symbol,taipeiDay(),state.listing).eligible).sort((a,b)=>Math.abs(b.deltaPP)-Math.abs(a.deltaPP));
   return card('成分權重變化',`<p>${e(fund.name)} ${e(symbol)}</p><p>儲存快照日期：${e(data.baseDate)} → ${e(data.date)}</p><p>快照日期不是基金揭露日期；權重差為百分點，不代表資金流。</p><p>${fund.complete?'兩期完整性已確認，可區分新增與移除。':'完整性未確認，只比較共同成分，缺列不視為零。'}</p>`)+(rows.length?rows.map(x=>{const quote=state.rows.find(r=>r.symbol===x.symbol),stock=identity(x.symbol,{name:x.name},state.listing.stocks[x.symbol]);return card(fund.complete&&x.beforeWeight===0?'新增成分':fund.complete&&x.afterWeight===0?'移除成分':'權重變化',rowList([{...quote,...stock,weight:x.deltaPP,weightIsDelta:true}],'rebalance.'+symbol)+facts({'前期權重 %':x.beforeWeight,'後期權重 %':x.afterWeight,'變化（百分點）':x.deltaPP}));}).join(''):status('尚無可比較變動','兩份快照的共同合格成分沒有可呈現的權重變化。'));
  }
  if(id==='bond'){
   const snapshots=await publicData('quant/etf/outputs/latest_snapshot.json'),d=snapshots[symbol];if(!d)return status('尚無配置資料','來源尚未提供基金持有資產。');
   const holdings=d.holdings||[],total=holdings.reduce((s,x)=>s+(Number.isFinite(x.weight)?x.weight:0),0);
   const metrics=d.metrics||{};
   const disclosure=fundDisclosure(d);
   const bondFacts=facts({'存續期間':metrics.duration,'到期殖利率':metrics.yield,'到期資訊':metrics.maturity,'債券類別':metrics.bond_type});
   const allocation=`<div class="bond-allocation"><div class="bond-donut" role="img" aria-label="資產配置圓環：分類資料不足，沒有可驗證比例"><span><strong>—</strong><small>資料不足</small></span></div><div class="bond-allocation-legend">${['國家配置','信用評等','資產類別'].map(label=>`<div><i aria-hidden="true"></i><span>${label}</span><b>資料不足</b></div>`).join('')}</div></div><p class="muted">保留計劃書配置圓環的位置；Public_Data 沒有可驗證的分類權重，圖中不代表任何比例。</p>`;
   return card('基金原始資產配置',facts({'基金':`${row.name} ${symbol}`,'資產類型':d.type,'分類':d.category,'資料模式':d.data_mode,'快照資料日':d.date??d.as_of??'來源日期不足','持倉揭露日期':disclosure.date??'揭露日期不足','持倉完整性':disclosure.complete?'來源已驗證完整':'來源未提供完整性證據','持倉來源':disclosure.source??'來源未提供','原始取得時間':disclosure.retrievedAt??'時間不足','沿用時間':disclosure.reusedAt??'未提供','原始權重合計':`${n(total)}%（未正規化）`})+'<p class="muted">以下是基金來源揭露的資產，不是可交易台股排行；債券／境外證券／現金不套用台股行情。</p>')+card('債券資訊',bondFacts+'<p class="muted">僅顯示 ETF snapshot 明確提供的指標；未提供的存續期間、到期殖利率、到期資訊或債券類別會顯示資料不足。不從基金名稱推測債券配置或信用評等。</p>')+card('資產配置',allocation)+card('資產明細',holdings.map(x=>{const stock=identity(x.stock_id,{name:x.stock_name},state.listing.stocks[x.stock_id]);return `<div class="toolbar"><a class="grow" href="#/security?symbol=${encodeURIComponent(stock.symbol)}"><strong>${e(stock.name)}</strong> <small>${e(stock.symbol)}</small></a>${favoriteButton(stock.symbol,stock.name,'etf-holding-'+stock.symbol)}<span>${n(x.weight)}%</span></div>`;}).join('')||'<p class="muted">資料不足。</p>');
  }

  if(id==='shareholders')return shareholderDistributionPage({state,card,metric,status,publicData},symbol,row);
  if(id==='health'){const [d,recent]=await Promise.all([publicData(`stocks/${encodeURIComponent(symbol)}.json`),ctx.loadRecentDailyChart(symbol,state.index,publicData).catch(()=>null)]);return renderHealth({card,facts},symbol,row,d,recent);}
  return null;
 }
 function listen(app){desktop.listen(app);m03.listen(app,ctx.refresh);m04Hot.listen(app,ctx.refresh);m04Research.listen(app,ctx.refresh);app.addEventListener('click',async event=>{const button=event.target.closest('[data-etf-history-range]');if(!button||button.disabled)return;state.etfHistoryRange=button.dataset.etfHistoryRange;await ctx.refresh();});app.addEventListener('input',ev=>{const form=ev.target.form;if(form?.id!=='scenario-form')return;document.querySelector('#scenario-results')?.replaceChildren();const feedback=form.querySelector('[role=status]');if(form.checkValidity()){feedback.textContent='條件已更新，正在重新計算…';form.requestSubmit();}else feedback.textContent='請輸入有效金額與 1 至 30 年的期間；有效時會自動更新。';});
  app.addEventListener('submit',async event=>{if(event.target.id!=='theme-search')return;event.preventDefault();themeQuery=String(new FormData(event.target).get('query')||'');themeSelected='';await ctx.refresh();});
  app.addEventListener('click',async event=>{if(!event.target.closest('[data-theme-clear]'))return;themeQuery='';await ctx.refresh();});
  app.addEventListener('change',async event=>{if(event.target.matches('select[name="theme"]')){themeSelected=event.target.value;await ctx.refresh();}});
  app.addEventListener('click',async event=>{const tab=event.target.closest('[data-macro-tab]');if(!tab)return;macroSection=tab.dataset.macroTab;await ctx.refresh();});
  flowHistory.listen(app);
  transfer.listen(app);services.listen(app);rotation.listen(app);etfUnitFlows.listen(app);etfMarket.listen(app);assets.listen(app);explore.listen(app);
  app.addEventListener('input',ev=>{if(ev.target.closest('#screen-form'))scannerDraft={...scannerDraft,[ev.target.name]:ev.target.value};if(ev.target.closest('#fx-form'))updateFxConversion();});
  app.addEventListener('change',ev=>{if(ev.target.closest('#screen-form'))scannerDraft={...scannerDraft,[ev.target.name]:ev.target.value};if(ev.target.closest('#fx-form'))updateFxConversion();});
  app.addEventListener('click',async ev=>{const headline=ev.target.closest('[data-briefing-headline]');if(headline){briefingIndex=Number(headline.dataset.briefingHeadline)||0;await ctx.refresh();return;}const step=ev.target.closest('[data-briefing-step]');if(step){briefingIndex=Math.max(0,briefingIndex+Number(step.dataset.briefingStep));await ctx.refresh();return;}if(ev.target.closest('[data-briefing-show-all]')){if(briefingShowAll&&briefingIndex>4)briefingIndex=4;briefingShowAll=!briefingShowAll;await ctx.refresh();return;}const tab=ev.target.closest('[data-scanner-tab]');if(tab){scannerTab=tab.dataset.scannerTab;await ctx.refresh();return;}if(ev.target.closest('[data-scanner-clear]')){scannerDraft=emptyScanner();scannerApplied=validateScanner(scannerDraft).filter;scannerError='';localStorage.setItem('rebuild.scanner.v1',JSON.stringify(scannerDraft));await ctx.refresh();}});
  app.addEventListener('submit',async ev=>{const form=ev.target;if(!['scenario-form','screen-form','institutional-range','quick-buy-filter','institutional-search','fx-form'].includes(form.id))return;ev.preventDefault();const data=Object.fromEntries(new FormData(form));try{
   if(form.id==='fx-form'){updateFxConversion();}
   if(form.id==='institutional-range'){if(data.from&&data.to&&data.from>data.to)throw new Error('起日不能晚於迄日');from=data.from;to=data.to;await ctx.refresh();}
   if(form.id==='institutional-search'){flowQuery=String(data.query||'').trim();await ctx.refresh();}
   if(form.id==='quick-buy-filter'){const days=Number(data.days),lots=Number(data.lots);if(!Number.isInteger(days)||days<0||!Number.isFinite(lots)||lots<0)throw Error('請填寫非負張數與整數買超天數');minimumBuyDays=days;minimumLots=lots;flowQuery=String(data.query||'').trim();await ctx.refresh();}
   if(form.id==='scenario-form'){
    document.querySelector('#scenario-results')?.replaceChildren();
    form.querySelector('[role=status]').textContent='正在計算情境…';
    const initial=Number(data.initial),monthly=Number(data.monthly),years=Number(data.years);
    if(![initial,monthly,years].every(Number.isFinite)||initial<0||monthly<0||!Number.isInteger(years)||years<1||years>30)throw new Error('請輸入非負金額及 1 至 30 的整數年數');
    const assumptions=[{label:'4%',rate:.04,color:'var(--blue)'},{label:'8%',rate:.08,color:'var(--orange)'},{label:'12%',rate:.12,color:'var(--purple)'}];
    const series=assumptions.map(item=>{const values=[{year:0,value:initial}];let value=initial;for(let year=1;year<=years;year++){for(let month=0;month<12;month++){value=value*Math.pow(1+item.rate,1/12)+monthly;if(!Number.isFinite(value))throw new Error('輸入金額過大，情境結果超出可計算範圍');}values.push({year,value});}return {...item,values};});
    const all=series.flatMap(item=>item.values.map(point=>point.value)),minimum=Math.min(...all),maximum=Math.max(...all),span=maximum-minimum||1;
    const x=year=>32+year/years*576,y=value=>190-(value-minimum)/span*150;
    const svg=`<svg class="chart" viewBox="0 0 640 224" role="img" aria-label="假設年報酬 4%、8%、12% 的逐年投入情境曲線">${[0,.5,1].map(t=>`<line x1="32" x2="608" y1="${40+t*150}" y2="${40+t*150}" stroke="var(--line)"/>`).join('')}<text x="32" y="24">${n(maximum,0)} TWD</text><text x="32" y="210">0 年</text><text x="608" y="210" text-anchor="end">${years} 年</text>${series.map(item=>`<polyline fill="none" stroke="${item.color}" stroke-width="3" points="${item.values.map(point=>`${x(point.year)},${y(point.value)}`).join(' ')}"/>`).join('')}</svg>`;
    const finalFacts=Object.fromEntries(series.map(item=>[`假設 ${item.label}・${years} 年`,`${n(item.values.at(-1).value,0)} TWD`]));
    const yearly=`<details><summary>查看逐年估算（0 至 ${years} 年）</summary>${Array.from({length:years+1},(_,year)=>card(`${year} 年`,facts(series.map(item=>[`假設 ${item.label}`,`${n(item.values[year].value,0)} TWD`])))).join('')}</details>`;
    document.querySelector('#scenario-results').innerHTML=card('逐年情境曲線',svg+`<div class="toolbar" aria-label="報酬情境圖例">${series.map(item=>`<span><i style="display:inline-block;width:12px;height:12px;background:${item.color};border-radius:50%"></i> 假設 ${e(item.label)}</span>`).join('')}</div>`)+card('期末估算',facts(finalFacts))+yearly;
    form.querySelector('[role=status]').textContent='情境已更新；每月月底投入，未扣稅費與通膨。';
   }
   if(form.id==='screen-form'){scannerDraft={...emptyScanner(),...data};const validation=validateScanner(scannerDraft);scannerError=validation.error||'';if(!scannerError){scannerApplied=validation.filter;localStorage.setItem('rebuild.scanner.v1',JSON.stringify(scannerDraft));}await ctx.refresh();}
  }catch(error){const el=form.querySelector('[role=status]')??document.createElement('p');el.className='alert';el.textContent=error.message;form.append(el);}});
  app.addEventListener('change',async ev=>{if(ev.target.id==='briefing-date'){briefingDate=ev.target.value;briefingIndex=0;briefingShowAll=false;await ctx.refresh();return;}if(ev.target.id==='sector-select'){selectedSector=ev.target.value;await ctx.refresh();}});
  app.addEventListener('click',async ev=>{const swap=ev.target.closest('[data-fx-swap]');if(swap){const form=document.querySelector('#fx-form'),from=form?.elements.namedItem('from'),to=form?.elements.namedItem('to');if(from&&to){const old=from.value;from.value=to.value;to.value=old;from.dispatchEvent(new Event('change',{bubbles:true}));}return;}const fxButton=ev.target.closest('[data-fx-range]');if(fxButton){fxRange=fxButton.dataset.fxRange;const rows=(fxData?.data||[]).filter(row=>row.date).sort((a,b)=>a.date.localeCompare(b.date));document.querySelector('#fx-trend-chart').innerHTML=fxTrendChart(fxRangePoints(rows,fxRange,taipeiDay()));document.querySelectorAll('[data-fx-range]').forEach(button=>{button.setAttribute('aria-pressed',String(button===fxButton));button.classList.toggle('primary',button===fxButton);});return;}const style=ev.target.closest('[data-quant-style]');if(style){quantStrategyMode=style.dataset.quantStyle;await ctx.refresh();return;}const mode=ev.target.closest('[data-quant-mode]');if(mode){quantSelection=mode.dataset.quantMode;await ctx.refresh();return;}const source=ev.target.closest('[data-research-source]');if(source){institutionalSource=source.dataset.researchSource;await ctx.refresh();}});
 }
 return {page,detail,listen,intraday:services.intraday,priceBand:services.priceBand,marketQuotes:services.marketQuotes,marketIndexQuotes:services.marketIndexQuotes};
}
