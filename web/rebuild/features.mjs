import {createDesktopPages} from './desktop-pages.mjs';
import {createFlowHistory} from './flow-history.mjs';
import {createNewsPage} from './news.mjs';
import {createTransferModule} from './transfer.mjs';
import {createServicesModule} from './services.mjs';
import {periodHistory} from './periods.mjs';
import {createETFUnitFlows,fundInformation} from './etf.mjs';
import {createAssetsModule} from './assets.mjs';
import {createExploreModule} from './explore.mjs';
import {createRotationPage} from './rotation.mjs';
import {emptyScanner,validateScanner,filterScannerRows,readScannerPreference} from './scanner.mjs';
import {normalizedInstitutional,flowSeries,flowChart,median,etfPerformanceView,rebalanceEntries,fxConversion,quantRows} from './research.mjs';
import {number as n,escapeHTML as e,resolveListingStatus,taipeiDay,compareCodepoints,identity} from './core.mjs';
export function featureModules(ctx){
 const transfer=createTransferModule(ctx),services=createServicesModule(ctx),etfUnitFlows=createETFUnitFlows(ctx),rotation=createRotationPage(ctx),assets=createAssetsModule(ctx),explore=createExploreModule(ctx);
 const desktop=createDesktopPages(ctx,explore,transfer);
 const flowHistory=createFlowHistory(ctx);
 let themeQuery='';
 const newsPage=createNewsPage(ctx);
 const {state,card,metric,status,rowList,link,publicData}=ctx;let institutionalSource='combined',from='',to='',selectedSector='',minimumBuyDays=0,minimumLots=0,flowQuery='';let fxData=null,quantSelection='all';let scannerDraft=readScannerPreference(localStorage),scannerApplied=validateScanner(scannerDraft).filter,scannerError='';

 const input=(name,label,value='',type='number')=>`<label>${label}<input name="${name}" type="${type}" value="${e(value)}" ${type==='number'?'step="any" min="0"':''} required></label>`;
 const facts=obj=>`<div class="metric-grid">${Object.entries(obj).map(([k,v])=>metric(k,typeof v==='number'?n(v):e(v??'資料不足'))).join('')}</div>`;
 const directory=ids=>card('',ids.map(id=>link(id)).join(''));
 async function page(id,symbol){
 if(desktop.handles(id))return desktop.page(id);
 if(transfer.handles(id))return transfer.page(id);
 if(id==='services')return services.page();
 if(id==='etf-flows')return etfUnitFlows.page();
 if(explore.handles(id))return explore.page(id,symbol);
 const assetPage=await assets.page(id,symbol);if(assetPage!==null)return assetPage;
 for(const f of [{id:'institutionalNet',title:'淨買賣超（張）'},{id:'trackingDays',title:'追蹤天數'},{id:'buyDays',title:'區間買超天數'},{id:'eps',title:'EPS'},{id:'score',title:'模型分數'}])if(!state.contract.fields.some(x=>x.id===f.id))state.contract.fields.push(f);
  if(id==='rotation')return rotation.page();
  if(id==='hot'){const rows=[...state.rows].filter(r=>Number.isFinite(r.volume)&&r.volume>0).sort((a,b)=>b.volume-a.volume||compareCodepoints(a.symbol,b.symbol)).slice(0,30);return card('成交量熱門排行',facts({'排行依據':'最新原始成交股數前 30 檔','行情日期':state.index.latest_daily_tw,'證券範圍':'目前上市資格通過名單'})+'<p class="muted">此頁為成交量排行；不當作產業漲幅或推薦訊號。</p>')+rowList(rows,'hot');}
  if(id==='quant'){const d=await publicData('quant/latest_portfolio.json'),items=(d.portfolio||[]).filter(p=>quantSelection==='all'||(quantSelection==='held'?p.is_held:!p.is_held));return card('量化精選',facts({'模型資料日期':d.date,'行情資料日期':state.index.latest_daily_tw,'來源':'latest_portfolio','模型狀態':d.regime})+'<p class="muted">模型觀察名單，不是已通過研究認證的投資推薦。現價來自原始日行情；模型進場價不當作現價。</p>')+`<div class="toolbar">${[['all','全部'],['held','模型持有'],['candidate','候選名單']].map(([v,n])=>`<button data-quant-mode="${v}" class="${quantSelection===v?'primary':''}">${n}</button>`).join('')}</div>`+rowList(quantRows(items,state.rows),'quant');}
  if(id==='rankings')return card('行情排序',`<p class="muted">實際漲跌幅只在來源提供交易所參考價時顯示。沒有參考價時顯示資料不足，可改依成交量或成交金額排序。</p>`)+rowList(state.rows,'rankings');
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
   const data=await publicData('quant/sector_pe.json'),query=themeQuery.trim().toLowerCase();
   const groups=(data.sectors??[]).map(group=>{
    const label=String(group.display_tag||group.sector_tag||'分類不足'),groupMatch=label.toLowerCase().includes(query)||String(group.sector_tag||'').toLowerCase().includes(query);
    const members=(group.stocks??[]).filter(stock=>resolveListingStatus(stock.stock_id,taipeiDay(),state.listing).eligible&&(!query||groupMatch||`${stock.name||''} ${stock.stock_id}`.toLowerCase().includes(query)));
    return {label,group,members};
   }).filter(group=>group.members.length);
   return card('族群搜尋',`<form id="theme-search" class="toolbar"><label>族群、股票名稱或代號<input type="search" name="query" value="${e(themeQuery)}"></label><button class="primary">搜尋</button><button type="button" data-theme-clear>清除</button></form><p class="muted">來源市場主題分組，不等同官方產業分類。資料日期：${e(data.date??'日期不足')}</p><p role="status">符合 ${groups.length} 個族群</p>`)+(groups.length?groups.map(({label,group,members})=>card(label,`<p>來源樣本 ${e(group.stock_count??'資料不足')} 檔；目前顯示 ${members.length} 檔</p>${rowList(members.map(stock=>({...state.rows.find(r=>r.symbol===stock.stock_id),...identity(stock.stock_id,{name:stock.name},state.listing.stocks[stock.stock_id]),pe:Number.isFinite(stock.pe_ratio)?stock.pe_ratio:null,eps:Number.isFinite(stock.eps)?stock.eps:null})),'sector-pe')}`)).join(''):status('沒有符合的族群','調整搜尋條件後重試。'));
  }
  if(id==='scanner'){
   const rows=filterScannerRows(state.rows,scannerApplied);
   const numeric=(key,label)=>`<label>${label}<input name="${key}" type="text" inputmode="decimal" value="${e(scannerDraft[key])}" placeholder="不限制"></label>`;
   return card('股票篩選',`<form id="screen-form" class="stack" novalidate><label>名稱、代號或產業<input name="query" type="search" value="${e(scannerDraft.query)}"></label><label>市場<select name="market">${[['','全部'],['TWSE','上市'],['TPEX','上櫃']].map(([v,label])=>`<option value="${v}" ${scannerDraft.market===v?'selected':''}>${label}</option>`).join('')}</select></label>${numeric('minPrice','最低原始市價')}${numeric('maxPrice','最高原始市價')}${numeric('minVolume','最低成交量（股）')}<div class="toolbar"><button class="primary" type="submit">套用條件</button><button type="button" data-scanner-clear>清除條件</button></div><p id="scanner-error" role="status" class="${scannerError?'alert':'muted'}">${e(scannerError||'空白表示不限制；結果使用已套用條件。')}</p></form><p class="muted">只顯示已確認上市的證券。市價使用原始價格，成交量單位為股；啟用數值條件時排除該欄缺值。</p>`)+`<div id="screen-results"><p role="status">符合 ${rows.length} 檔</p>${rowList(rows,'scanner')}</div>`;
  }
  if(id==='simulation')return card('模擬條件',`<form id="scenario-form" class="stack"><label for="scenario-initial">初始投入金額</label><input id="scenario-initial" name="initial" type="number" min="0" step="any" value="1000000" required aria-describedby="scenario-status"><label for="scenario-monthly">每月投入金額</label><input id="scenario-monthly" name="monthly" type="number" min="0" step="any" value="10000" required aria-describedby="scenario-status"><label for="scenario-years">模擬期間（年）</label><input id="scenario-years" name="years" type="number" min="1" max="30" step="1" value="5" required aria-describedby="scenario-status"><button class="primary">計算情境</button><p id="scenario-status" role="status" class="muted"></p></form><p class="muted">固定年報酬 4%、8%、12%，每月底投入；未扣稅費與通膨。此為數學情境，不是預測或實際績效。</p><div id="scenario-results" aria-live="polite"></div>`);
  if(id==='briefing'){
   const d=await publicData('audio_summaries/show_summaries.json');
   return card('財經節目摘要',`<p>來源更新：${e(d.last_updated??'資料日期不足')}</p><p class="muted">來源節目摘要，不是即時行情或個人化投資建議；請依發布日期閱讀原文。</p>`)+(d.episodes??[]).slice().sort((a,b)=>String(b.publish_date).localeCompare(String(a.publish_date))).map(x=>card(x.title,`<p class="muted">${e(x.show_name)} · ${e(x.publish_date)}</p>${(x.ai_summary?.key_data??[]).map(t=>`<p>${e(t)}</p>`).join('')}<details><summary>來源完整摘要</summary><h3>正面觀察</h3>${(x.ai_summary?.bullish_points??[]).map(t=>`<p>${e(t)}</p>`).join('')}<h3>風險觀察</h3>${(x.ai_summary?.bearish_points??[]).map(t=>`<p>${e(t)}</p>`).join('')}</details>${/^https?:\/\//.test(x.source_url??'')?`<a href="${e(x.source_url)}" target="_blank" rel="noopener noreferrer">開啟節目來源</a>`:''}`)).join('');
  }
  if(id==='fx'){
   fxData=await publicData('meta/exchange_rate_history.json');const rows=(fxData.data||[]).filter(r=>r.date).sort((a,b)=>a.date.localeCompare(b.date)),latest=rows.at(-1);if(!latest)return status('尚無匯率資料','請同步後重試。');
   const currencies=(fxData.currencies||[]).filter(c=>c.endsWith('_TWD'));
   return card('匯率工具',facts({'匯率日期':latest.date,'來源更新':fxData.updated_at,'報價方向':'每 1 單位外幣兌新臺幣','資料來源':'exchange_rate_history'}))+card('貨幣換算',`<form id="fx-form" class="stack">${input('amount','換算金額',1000)}<div class="metric-grid"><label>原幣別<select name="from">${currencies.map(c=>`<option value="${e(c)}" ${c==='TWD_TWD'?'selected':''}>${e(c.replace('_TWD',''))}</option>`).join('')}</select></label><label>目標幣別<select name="to">${currencies.map(c=>`<option value="${e(c)}" ${c==='USD_TWD'?'selected':''}>${e(c.replace('_TWD',''))}</option>`).join('')}</select></label></div><button class="primary">換算</button></form><div id="fx-result" role="status"></div><p class="muted">使用同日來源匯率估算；不是銀行現金買入／賣出報價。零或缺值匯率不可換算。</p>`)+card('最新匯率',facts(Object.fromEntries(currencies.map(c=>[c.replace('_TWD','')+' / TWD',latest[c]>0?latest[c]:'資料不足']))));
  }
  return null;
 }
 async function detail(id,symbol,row){
  if(id==='company'){
   const source=await publicData(`stocks/${encodeURIComponent(symbol)}.json`);
   if(source.stock_id!==symbol)return status('公司資料身份不符','來源資料代號與目前選取證券不同。');
   const summary=typeof source.business_summary==='string'&&source.business_summary.trim()?source.business_summary.trim():null;
   const sector=row.sector||source.sector?.name||source.sector||'資料不足',market=row.market||state.listing?.stocks?.[symbol]?.market||'資料不足';
   return card(`${row.name||symbol} ${symbol}・公司基本資料`,facts({'公司名稱':row.name||symbol,'官方產業':sector,'市場':market,'資料日期':source.date,'基本資料來源日期':source.source_dates?.price}))+
    (summary?card('公司簡介',`<p>${e(summary)}</p>`):status('公司簡介資料不足','Public_Data 目前沒有此證券可用的 business_summary；不以產業名稱推測公司業務。'));
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
   const overview=facts({'發布狀態':available?'可發布':'不可發布','公允價值（元／股）':available?value.fair_value:null,'估值參考市價（元／股）':value.market_price,'上／下行幅度（%）':value.upside??explanation?.upside_downside_pct,'模型版本':value.model_version??value.model,'報告期間':value.reported_period,'來源資料日':value.as_of,'模型數':value.model_count,'估值家族':(value.families_used||explanation?.families_used||[]).join('、')});
   const blocked=available?'':status('公允價值不可發布',String(block),'!');
   const note=summary?`<p>${e(summary)}</p>`:'';
   let body=card('估值狀態',overview+blocked+note+'<p class="muted">估值是模型估計，不保證未來價格；參考市價與來源日期沿用估值資料本身，不代替目前原始行情。</p>');
   if(id==='valuation-evidence'){
    const contributions=explanation?.model_contributions||explanation?.valuation_basis||[];
    const drivers=[...(explanation?.positive_drivers||[]),...(explanation?.negative_drivers||[])];
    body+=card('模型貢獻',available&&contributions.length?contributions.map(item=>card(item.model_name||item.model||'估值模型',facts({'模型家族':item.family,'估值（元／股）':item.value,'是否納入':item.eligible===true?'是':item.eligible===false?'否':'資料不足','信心分數':item.confidence,'模型權重':item.weight,'驗證狀態':item.validation_status??item.validation?.status,'排除原因':item.reason_if_excluded??item.reason}))).join(''):status('沒有可發布模型貢獻',available?'來源未附模型貢獻明細。':String(block)));
    body+=card('模型驅動因素',available&&drivers.length?drivers.map(item=>`<p>${e(item.description_zh??item.description??item.type??'來源未提供說明')}・${e(item.direction??'方向未提供')} ${Number.isFinite(item.value)?n(item.value):'資料不足'}</p>`).join(''):status('沒有可發布驅動因素',available?'來源未附驅動因素。':String(block)));
    const quality=explanation?.data_quality||{};
    body+=card('資料品質與發布限制',facts({'內在估值信心':explanation?.intrinsic_valuation_confidence,'同業樣本數':quality.peer_sample_size,'模型家族數':quality.model_family_count,'前瞻 EPS 可用':quality.forward_eps_available===true?'是':quality.forward_eps_available===false?'否':null,'前瞻營收可用':quality.forward_revenue_available===true?'是':quality.forward_revenue_available===false?'否':null})+([...new Set([...(quality.missing_inputs||[]),...(quality.warnings||[]),...(value.review_required_flags||[]),...(value.hard_fail_flags||[])])].length?[...new Set([...(quality.missing_inputs||[]),...(quality.warnings||[]),...(value.review_required_flags||[]),...(value.hard_fail_flags||[])])].map(item=>`<p>${e(item)}</p>`).join(''):status('來源未列資料品質警示','此處不代表已完成獨立研究認證。')));
   }
   return body;
  }
  if(id==='fund')return fundInformation(ctx,symbol,row);
  if(id==='news')return newsPage.page(symbol,row);
  if(['flows','margin'].includes(id))return flowHistory.page(id,symbol,row);
  if(id==='constituents'&&matchMedia('(min-width:1100px)').matches)return desktop.etf(symbol,row);
  if(['revenue','earnings','dividends'].includes(id))return periodHistory(ctx,id,symbol,row);
  if(id==='etf-performance'){
   const dividends=await periodHistory(ctx,'dividends',symbol,row).catch(error=>status('配息紀錄暫不可用',error.message,'↗',true));
   let data,p;try{data=await publicData('quant/etf/outputs/etf_year_performance.json');p=etfPerformanceView(data,symbol);}catch(error){return status('ETF績效暫不可用',error.message,'↗',true)+dividends;}
   if(!p)return status('尚無ETF期間報酬','資料來源沒有此基金的績效紀錄。')+dividends;
   const r=p.row;return card(`${r.etf_name||row.name} ${symbol} · 期間報酬`,facts({'觀察起日':r.first_date,'觀察迄日':r.latest_date,'報酬尺度':p.basis,'區間報酬':p.datesValid&&p.returnValue!==null?`${n(p.returnValue)}%`:'資料不足','原始首日收盤':r.first_close,'原始末日收盤':r.latest_close,'報酬資料日期':data.date}))+card('績效說明','<p>報酬直接取用來源指定的價格尺度；原始首末收盤僅供行情參考，不用它們重新計算還原報酬。此處不是年化報酬，也未驗證為股息再投資總報酬。</p><p class="muted">配息紀錄依來源日期另列；不將還原價格報酬標為含息報酬。</p>')+dividends;
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
   const bondFacts=facts({'存續期間':metrics.duration,'到期殖利率':metrics.yield,'到期資訊':metrics.maturity,'債券類別':metrics.bond_type});
   return card('基金原始資產配置',facts({'基金':`${row.name} ${symbol}`,'資產類型':d.type,'分類':d.category,'資料模式':d.data_mode,'資料日期':d.date??d.as_of??'來源日期不足','原始權重合計':`${n(total)}%（未正規化）`})+'<p class="muted">以下是基金來源揭露的資產，不是可交易台股排行；債券／境外證券／現金不套用台股行情。</p>')+card('資產明細',holdings.map(x=>{const stock=identity(x.stock_id,{name:x.stock_name},state.listing.stocks[x.stock_id]);return `<div class="toolbar"><span class="grow"><strong>${e(stock.name)}</strong> <small>${e(stock.symbol)}</small></span><span>${n(x.weight)}%</span></div>`;}).join('')||'<p class="muted">資料不足。</p>')+card('債券資訊',bondFacts+'<p class="muted">僅顯示 ETF snapshot 明確提供的指標；未提供的存續期間、到期殖利率、到期資訊或債券類別會顯示資料不足。不從基金名稱推測債券配置或信用評等。</p>');
  }

  if(['shareholders','health'].includes(id)){const d=await publicData(`stocks/${encodeURIComponent(symbol)}.json`);if(id==='shareholders')return card('大股東結構',facts({'資料週別':d.source_dates?.weekly,'大股東變動':d.tdcc?.big_holder_change,'散戶變動':d.tdcc?.retail_holder_change,'持股集中度':d.tdcc?.holder_concentration}));return card('個股健檢',facts({'行情來源日':d.source_dates?.price,'籌碼來源日':d.source_dates?.margin??'來源日期不足','持股來源週':d.source_dates?.weekly,'量化來源日':d.source_dates?.quant,'技術分數':d.score_components?.technical,'籌碼分數':d.score_components?.chip,'健檢分數':d.health_score,'風險程度':d.risk_level}))+card('資料觀察',`<p>${e(d.chip_warning??d.ai_narrative??'尚無摘要')}</p>`);}
  return null;
 }
 function listen(app){desktop.listen(app);app.addEventListener('input',ev=>{const form=ev.target.form;if(form?.id!=='scenario-form')return;document.querySelector('#scenario-results')?.replaceChildren();const feedback=form.querySelector('[role=status]');if(form.checkValidity()){feedback.textContent='條件已更新，正在重新計算…';form.requestSubmit();}else feedback.textContent='請輸入有效金額與 1 至 30 年的期間；有效時會自動更新。';});
  app.addEventListener('submit',async event=>{if(event.target.id!=='theme-search')return;event.preventDefault();themeQuery=String(new FormData(event.target).get('query')||'');await ctx.refresh();});
  app.addEventListener('click',async event=>{if(!event.target.closest('[data-theme-clear]'))return;themeQuery='';await ctx.refresh();});
  flowHistory.listen(app);
  transfer.listen(app);services.listen(app);rotation.listen(app);etfUnitFlows.listen(app);assets.listen(app);explore.listen(app);
  app.addEventListener('input',ev=>{if(ev.target.closest('#screen-form'))scannerDraft={...scannerDraft,[ev.target.name]:ev.target.value};});
  app.addEventListener('change',ev=>{if(ev.target.closest('#screen-form'))scannerDraft={...scannerDraft,[ev.target.name]:ev.target.value};});
  app.addEventListener('click',async ev=>{if(ev.target.closest('[data-scanner-clear]')){scannerDraft=emptyScanner();scannerApplied=validateScanner(scannerDraft).filter;scannerError='';localStorage.setItem('rebuild.scanner.v1',JSON.stringify(scannerDraft));await ctx.refresh();}});
  app.addEventListener('submit',async ev=>{const form=ev.target;if(!['scenario-form','screen-form','institutional-range','quick-buy-filter','institutional-search','fx-form'].includes(form.id))return;ev.preventDefault();const data=Object.fromEntries(new FormData(form));try{
   if(form.id==='fx-form'){const latest=[...(fxData?.data||[])].sort((a,b)=>a.date.localeCompare(b.date)).at(-1),value=fxConversion(Number(data.amount),latest?.[data.from],latest?.[data.to]);document.querySelector('#fx-result').textContent=value===null?'匯率資料不足，無法換算。':`${n(Number(data.amount))} ${data.from.replace('_TWD','')} ≈ ${n(value)} ${data.to.replace('_TWD','')}（${latest.date}）`;}
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
  app.addEventListener('change',async ev=>{if(ev.target.id==='sector-select'){selectedSector=ev.target.value;await ctx.refresh();}});
  app.addEventListener('click',async ev=>{const mode=ev.target.closest('[data-quant-mode]');if(mode){quantSelection=mode.dataset.quantMode;await ctx.refresh();return;}const source=ev.target.closest('[data-research-source]');if(source){institutionalSource=source.dataset.researchSource;await ctx.refresh();}});
 }
 return {page,detail,listen,intraday:services.intraday,priceBand:services.priceBand};
}
