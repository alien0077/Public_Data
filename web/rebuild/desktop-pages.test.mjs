import test from 'node:test';
import assert from 'node:assert/strict';
import {createDesktopPages,desktopSecurityWatchRows} from './desktop-pages.mjs';

function harness(){
 const now=Date.now(),today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
 const dayLabel=offset=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now-offset*86400000)),days=[dayLabel(2),dayLabel(1)];
 const intraday={schemaVersion:1,source:'yahoo.chart.1m',generatedAt:new Date(now).toISOString(),indices:[
  {symbol:'IX0001',status:'AVAILABLE',dataDate:today,points:[{timestamp:Math.floor((now-60000)/1000),close:100},{timestamp:Math.floor((now-30000)/1000),close:101}]},
  {symbol:'IX0043',status:'AVAILABLE',dataDate:today,points:[{timestamp:Math.floor((now-60000)/1000),close:200},{timestamp:Math.floor((now-30000)/1000),close:198}]}
 ]};
 const state={rows:[{symbol:'2330',name:'台積電',market:'TWSE',securityType:'equity',sector:'半導體',industry:'半導體',changePercent:1,turnover:100,volume:50,foreignNet:10},{symbol:'2317',name:'鴻海',market:'TWSE',securityType:'equity',sector:'電子零組件',industry:'電子零組件',changePercent:-1,turnover:50,volume:70,foreignNet:-5}],indices:[{symbol:'IX0001',name:'加權指數',price:100,changePercent:1,asOf:today},{symbol:'IX0043',name:'櫃買指數',price:200,changePercent:-1,asOf:today}],index:{latest_daily_tw:today,available_days_tw_indices:days}};
 const calls=[];
 const ctx={state,calls,refresh:async()=>{},publicData:async path=>{calls.push(path);if(path==='rebuild/index-intraday.json')return intraday;const date=path.match(/daily\/tw_indices\/(\d{4}-\d{2}-\d{2})\.json/)?.[1];if(date)return {date,stocks:[{id:'IX0001',c:date===days[0]?99:100},{id:'IX0043',c:date===days[0]?205:200}]};throw Error(`Unexpected source ${path}`);},card:(title,body)=>`<section class="card"><h2>${title}</h2>${body}</section>`,metric:(label,value)=>`<div class="metric"><small>${label}</small><strong>${value}</strong></div>`,status:(title,message)=>`<div role="status">${title} ${message}</div>`,rowList:rows=>`<table>${rows.map(row=>`<tr>${row.name} ${row.symbol}</tr>`).join('')}</table>`,link:(id,label='link',symbol)=>`<a href="#/${id}${symbol?`?symbol=${encodeURIComponent(symbol)}`:''}">${label}</a>`,favoriteButton:(symbol,name,id)=>`<button class="star" data-action="favorite" data-symbol="${symbol}" data-favorite-id="${id}" aria-label="加入預設自選 ${name} ${symbol}">☆</button>`,fieldsEditor:(context,inline,layout)=>`<div data-fields-editor="${context}" data-layout="${layout}"></div>`,chooseRows:()=>[]};
 return {ctx,pages:createDesktopPages(ctx,{page:async id=>`research:${id}`,desktopStrategyPanel:async()=>'<section class="d03-strategy-inspector">策略詳情</section>',desktopStrategyOptions:async()=>'<label>策略範本<select data-desktop-strategy-select></select></label>',desktopBacktestResults:()=>'<section class="d03-backtest-report"><h2>回測摘要與績效圖表</h2><div>資料不足</div></section>',desktopBacktestControls:()=>'<section class="d03-run-controls"><h2>回測設定</h2><input form="explore-run" name="fee"></section>'},{page:async id=>id==='backup'?'<button class="primary" data-action="backup">建立並匯出完整備份</button>':''})};
}

test('desktop security watch rows keep stock details and a favorite toggle for every row',()=>{
 const html=desktopSecurityWatchRows([
  {name:'台積電',symbol:'2330',price:1200,changePercent:1.2},
  {name:'鴻海',symbol:'2317',price:190,changePercent:-0.5}
 ],{
  securityTarget:()=>`security`,
  stockSummary:row=>`${row.name} ${row.symbol}`,
  format:(row,key)=>key==='price'?String(row.price):`${row.changePercent}%`,
  movement:value=>value>0?'up':value<0?'down':'muted',
  favoriteButton:(symbol,name,id)=>`<button class="star" data-action="favorite" data-symbol="${symbol}" data-favorite-id="${id}" aria-label="加入自選 ${name} ${symbol}">☆</button>`
 });
 assert.equal((html.match(/class="desktop-security-watch-item"/g)||[]).length,2);
 for(const [symbol,name] of [['2330','台積電'],['2317','鴻海']]){
  assert.match(html,new RegExp(`href="#/security\\?symbol=${symbol}" aria-label="${name} ${symbol}，開啟詳情"`));
  assert.match(html,new RegExp(`data-action="favorite" data-symbol="${symbol}" data-favorite-id="desktop-security-watch-${symbol}"`));
 }
 assert.match(html,/class="up"/);assert.match(html,/class="down"/);
});

test('desktop security watch rows have a clear empty state',()=>{
 assert.match(desktopSecurityWatchRows([],{}),/此自選分類尚無已載入行情/);
});

test('D01 composes the plan dashboard and keeps missing sector-index sources explicit',async()=>{
 const {pages}=harness(),html=await pages.page('overview');
 assert.match(html,/class="desktop-page desktop-market"/);
 assert.match(html,/加權指數/);assert.match(html,/TAIEX/);assert.match(html,/櫃買指數/);assert.match(html,/OTC/);
 assert.match(html,/電子指數/);assert.match(html,/金融指數/);assert.match(html,/canonical 日指數來源未提供/);
 assert.match(html,/class="desk-chart"/);assert.match(html,/class="desk-secondary"/);assert.match(html,/data-heatmap/);
 assert.match(html,/class="desktop-index-sparkline"/);assert.match(html,/role="img" aria-label="加權指數 IX0001 原始收盤點數圖/);assert.match(html,/class="index-area/);assert.match(html,/加權指數原始收盤點數/);assert.match(html,/成交量柱資料不足/);assert.doesNotMatch(html,/加權指數與櫃買指數相對漲跌比較圖/);
 for(const range of ['intraday','5d','1m','3m','6m','1y','3y','all'])assert.match(html,new RegExp(`data-desktop-market-range="${range}"`));
 for(const rank of ['turnover','changePercent','foreignNet','volume'])assert.match(html,new RegExp(`data-desktop-rank="${rank}"`));
 assert.match(html,/外資/);assert.match(html,/上漲/);assert.match(html,/法人買賣來源摘要/);
 assert.match(html,/data-favorite-id="desktop-market-2330"/);
 assert.match(html,/data-favorite-id="desktop-market-2317"/);
});

test('D01 historical interval control loads canonical raw index closes',async()=>{
 const {pages}=harness(),listeners={};
 pages.listen({addEventListener:(name,fn)=>{listeners[name]=fn;}});
 await listeners.click({target:{closest:selector=>selector==='[data-desktop-market-range]'?{dataset:{desktopMarketRange:'5d'}}:null}});
 const html=await pages.page('overview');
 assert.match(html,/aria-pressed="true" class="primary">5日/);
 assert.match(html,/依加權指數原始收盤點數/);assert.match(html,/歷史走勢/);
});

test('D01 falls back from missing intraday snapshot to the canonical five-day chart',async()=>{
 const {ctx,pages}=harness();
 ctx.publicData=async path=>{
  if(path==='rebuild/index-intraday.json')throw Error('HTTP 404');
  const date=path.match(/daily\/tw_indices\/(\d{4}-\d{2}-\d{2})\.json/)?.[1];
  if(date)return {date,stocks:[{id:'IX0001',c:date.endsWith('14')?100:99,v:10,t:20},{id:'IX0043',c:200,v:5,t:8}]};
  throw Error(`Unexpected source ${path}`);
 };
 const html=await pages.page('overview');
 assert.match(html,/aria-pressed="true" class="primary">5日/);
 assert.match(html,/加權指數・歷史走勢/);
 assert.match(html,/role="img" aria-label="加權指數 IX0001 原始收盤點數圖/);
 assert.match(html,/X 軸|加權指數原始收盤點數/);
 assert.doesNotMatch(html,/資料讀取失敗（404）/);
});

test('D01 does not present zero market totals when canonical full raw turnover is unavailable',async()=>{
 const {ctx,pages}=harness();ctx.state.rows=[];
 const html=await pages.page('overview');
 assert.match(html,/<h2>市場漲跌家數<\/h2>[\s\S]*?上漲<\/small><strong>資料不足/);
 assert.match(html,/沒有具有效原始參考價的行情列，無法計算家數/);
 assert.match(html,/<h2>Public_Data 台股原始行情成交金額合計<\/h2><strong class="hero-value">資料不足/);
 assert.match(html,/<h2>法人買賣來源摘要<\/h2>[\s\S]*?外資<\/small><strong>資料不足/);
});

test('D03 composes filter, result/backtest, and selected-strategy columns without bypassing listing eligibility',async()=>{
 const {ctx,pages}=harness(),html=await pages.page('explore');
 assert.match(html,/class="desktop-page desktop-explore"/);
 assert.match(html,/aria-label="探索工作台分區"/);
 for(const route of ['explore','institutional','quick-filter','quant','strategies','etfs'])assert.match(html,new RegExp(`#/${route}`));
 for(const sort of ['changePercent','turnover','volume','price'])assert.match(html,new RegExp(`value="${sort}"`));
 assert.match(html,/篩選結果・0 檔/);
 assert.match(html,/回測摘要與績效圖表/);
 assert.match(html,/d03-backtest-report/);
 assert.match(html,/d03-run-controls/);
 assert.match(html,/id="explore-run"/);
 assert.match(html,/data-desktop-strategy-select/);
 assert.match(html,/form="explore-run" name="fee"/);
 assert.match(html,/name="symbol" required disabled/);
 assert.doesNotMatch(html,/<p role="status" class="alert"><\/p>/);
 assert.match(html,/缺連續 OHLCV／指標序列，條件停用；不產生假訊號/);
 assert.match(html,/當日資格或財務欄位未齊，條件停用；不估算/);
 assert.match(html,/僅依已載 canonical 欄位排序；5 日漲幅需完整序列/);
 assert.match(html,/class="d03-sort-controls"[\s\S]*data-desktop-explore-sort[\s\S]*data-desktop-explore-direction/);
 assert.ok(html.indexOf('id="explore-run"')<html.indexOf('class="desk-results"'));
 assert.ok(html.indexOf('class="d03-run-controls"')>html.indexOf('class="desk-lab"'));
 assert.doesNotMatch(html,/research:laboratory|lab-prompt-form/);
 assert.match(html,/d03-strategy-inspector/);
 assert.doesNotMatch(html,/台積電 2330/);
 assert.deepEqual(ctx.calls,[]);
});

test('D06 matches the plan workspace and keeps real-data empty states explicit',async()=>{
 const {pages,ctx}=harness(),html=await pages.page('fields');
 assert.match(html,/class="d06-settings-page"/);
 assert.match(html,/aria-label="主要分頁"[\s\S]*href="#\/market"|aria-label="主要分頁"[\s\S]*href="#\/overview"/);
 assert.match(html,/class="d06-primary-tabs"[\s\S]*href="#\/more" aria-current="page"/);
 assert.match(html,/class="d06-settings-nav"/);
 assert.match(html,/class="d06-fields"[\s\S]*data-fields-editor="watchlist" data-layout="d06"/);
 assert.match(html,/class="d06-preview"[\s\S]*即時預覽/);
 assert.match(html,/class="d06-sync"[\s\S]*資料同步/);
 assert.match(html,/class="d06-backup"[\s\S]*備份還原/);
 assert.match(html,/data-action="backup"/);
 assert.doesNotMatch(html,/\[object Promise\]/);
 assert.match(html,/缺少實際自選資料時不填入示意行情/);
 assert.deepEqual(ctx.calls,[]);
});

test('D05 keeps the ETF workspace composition visible while unknown listing eligibility blocks live analytics',async()=>{
 const {ctx,pages}=harness();
 ctx.state.listing={stocks:{}};
 const html=await pages.etf('0050',{symbol:'0050',name:'元大台灣50',securityType:'fund'});
 assert.match(html,/class="desktop-page desktop-etf"/);
 assert.match(html,/class="d05-quote"[\s\S]*元大台灣50 0050/);
 assert.match(html,/aria-label="ETF 工作台分區"/);
 assert.match(html,/class="d05-allocation"[\s\S]*前十大持股權重[\s\S]*已揭露台股產業配置/);
 assert.match(html,/class="d05-holdings"[\s\S]*基金成分/);
 assert.match(html,/class="d05-facts"[\s\S]*ETF 期間績效[\s\S]*基金資訊[\s\S]*兩期權重變化/);
 assert.match(html,/上市資格尚未確認/);
 assert.doesNotMatch(html,/hero-value|\b\d+\.\d+%/);
 assert.deepEqual(ctx.calls,[]);
});

test('D05 renders the plan workspace with raw ETF values when current listing eligibility is proven',async()=>{
 const {ctx,pages}=harness(),today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 ctx.state.contract={routes:[{id:'constituents',title:'成分與配置'},{id:'etf-performance',title:'ETF 配息與績效'},{id:'fund',title:'基金資訊'},{id:'bond',title:'債券 ETF 配置'},{id:'rebalance',title:'成分調整'}]};
 ctx.state.index.latest_daily_tw=today;
 ctx.state.listing={cutoff:today,validThrough:today,stocks:{'0050':{status:'LISTED',eligible:true,securityType:'fund',market:'TWSE'},'2330':{status:'LISTED',eligible:true,securityType:'equity',market:'TWSE'}}};
 ctx.state.rows.push({symbol:'0050',name:'元大台灣50',market:'TWSE',securityType:'fund',price:108.9,change:-4.1,changePercent:-3.63,volume:453386198,turnover:49538386174});
 ctx.publicData=async path=>{
  ctx.calls.push(path);
  if(path==='quant/etf/outputs/latest_snapshot.json')return {'0050':{name:'元大台灣50',data_mode:'full_holdings',holdings_as_of:today,holdings_source:'公開說明書',holdings_verified_complete:true,holdings:[{stock_id:'2330',stock_name:'台積電',weight:57.08}]}};
  if(path==='quant/etf/outputs/etf_year_performance.json')return {date:today,etfs:[{etf_id:'0050',first_date:today,latest_date:today,return_price_basis:'raw_close',return_pct:-3.63}]};
  if(path==='rebuild/etf-facts.json')return {schemaVersion:1,cutoff:today,dateSemantics:'asOf_is_source_fact_date_generatedAt_is_collection_time',generatedAt:`${today}T08:00:00+08:00`,funds:{'0050':{symbol:'0050',name:'元大台灣50',fullName:'元大台灣50',issuer:'元大投信',indexName:'臺灣50指數',fundType:'股票型 ETF',inceptionDate:'2003-06-25',listingDate:'2003-06-30',sourceURL:'https://example.com/fund'}}};
  throw Error(`Missing fixture: ${path}`);
 };
 const html=await pages.etf('0050',ctx.state.rows.at(-1));
 assert.match(html,/class="desktop-page desktop-etf"/);
 assert.match(html,/元大台灣50 0050・基金行情/);
 assert.match(html,/108\.9/);assert.match(html,/-4\.1/);assert.match(html,/2026|行情日期/);
 assert.match(html,/ETF 工作台分區/);assert.match(html,/基金成分/);assert.match(html,/台積電 2330/);assert.match(html,/57\.08%/);
 assert.match(html,/href="#\/security\?symbol=2330"[^>]*aria-label="查看個股：台積電 2330"/);
 assert.match(html,/data-favorite-id="desktop-etf-top-2330"/);
 assert.match(html,/ETF 配息與績效/);assert.match(html,/基金資訊/);assert.match(html,/href="#\/etf-performance\?symbol=0050"/);assert.match(html,/行情日期/);
 assert.deepEqual(ctx.calls,['quant/etf/outputs/latest_snapshot.json','rebuild/etf-comparison.json','quant/etf/outputs/etf_year_performance.json','rebuild/etf-facts.json','rebuild/etf-quarterly-holdings/index.json']);
});
