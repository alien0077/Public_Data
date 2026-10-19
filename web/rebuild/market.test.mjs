import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {marketOverview} from './market.mjs';
import {exploreMarketMarkup} from './explore-market.mjs';

test('Explore market summary uses matching Taiwan/US tabs and preserves five US cards',()=>{
 const link=(id,label,symbol)=>`<a href="#/${id}${symbol?`?symbol=${encodeURIComponent(symbol)}`:''}">${label}</a>`;
 const favoriteButton=(symbol,name,id)=>`<button data-action="favorite" data-symbol="${symbol}" data-favorite-id="${id}">☆ ${name}</button>`;
 const indices=[
  {symbol:'IX0001',price:23000,changePercent:0.5,asOf:'2026-10-16'},
  {symbol:'IX0043',price:250,changePercent:-0.2,asOf:'2026-10-16'},
  {symbol:'^DJI',price:46000,changePercent:0.1,asOf:'2026-10-16'},
  {symbol:'^IXIC',price:22000,changePercent:0.2,asOf:'2026-10-16'},
  {symbol:'^GSPC',price:6800,changePercent:0.3,asOf:'2026-10-16'},
  {symbol:'^SOX',price:7000,changePercent:-0.4,asOf:'2026-10-16'},
  {symbol:'TSM',price:300,changePercent:0.6,asOf:'2026-10-16'}
 ];
 const tw=exploreMarketMarkup({indices,selected:'taiwan',link,favoriteButton});
 assert.match(tw,/探索市場分頁/);
 assert.match(tw,/aria-pressed="true">台股/);
 assert.match(tw,/aria-pressed="false">美股/);
 assert.match(tw,/加權指數 IX0001/);
 assert.match(tw,/櫃買指數 IX0043/);
 assert.equal((tw.match(/data-explore-index=/g)||[]).length,2,'the Taiwan compact preview shows only the two requested indices');
 assert.doesNotMatch(tw,/台指期近月/,'do not add a third unsupported futures tile to the M03 preview');
 assert.match(tw,/data-exchange-clock="TW"/);
 assert.doesNotMatch(tw,/道瓊工業指數/);

 const us=exploreMarketMarkup({indices,selected:'us',link,favoriteButton});
 assert.match(us,/aria-pressed="false">台股/);
 assert.match(us,/aria-pressed="true">美股/);
 for(const symbol of ['^DJI','^IXIC','^GSPC','^SOX','TSM'])assert.match(us,new RegExp(`data-explore-index="${symbol.replace('^','\\^')}"`));
 assert.match(us,/data-exchange-clock="US"/);
 assert.match(us,/#\/security\?symbol=TSM/);
 assert.match(us,/data-action="favorite" data-symbol="TSM"/);
 assert.doesNotMatch(us,/IX0001/);

 const missing=exploreMarketMarkup({indices:[],selected:'us',link,favoriteButton});
 assert.equal((missing.match(/data-explore-index=/g)||[]).length,5,'all US index and ADR cards stay visible when source data is missing');
 assert.equal((missing.match(/資料不足/g)||[]).length,10,'missing value and change are explicitly labelled');
});

test('Explore uses the existing rate-limited live quote fallbacks and labels each provider accurately',()=>{
 const app=fs.readFileSync(new URL('./app.mjs',import.meta.url),'utf8');
 assert.match(app,/selectedMarket==='us'\?modules\.marketQuotes:modules\.marketIndexQuotes/);
 assert.match(app,/Object\.assign\(state\.exploreMarketQuotes,await quoteLoader\(state\)\)/);
 assert.match(app,/cached\.date!==marketToday\|\|row\.asOf===marketToday/,'stale live quotes are discarded when the market date changes or canonical daily data arrives');
 const link=(id,label,symbol)=>`<a href="#/${id}${symbol?`?symbol=${encodeURIComponent(symbol)}`:''}">${label}</a>`;
 const favoriteButton=(symbol,name,id)=>`<button data-action="favorite" data-symbol="${symbol}" data-favorite-id="${id}">☆ ${name}</button>`;
 const indices=[
  {symbol:'IX0001',price:23001,changePercent:0.5,date:'2026-10-20',time:'10:00:00',source:'Fugle',isIntraday:true,asOf:'2026-10-16'},
  {symbol:'IX0043',price:251,changePercent:-0.2,date:'2026-10-20',time:'10:01:00',source:'Yahoo Finance',isIntraday:true,asOf:'2026-10-16'},
  ...['^DJI','^IXIC','^GSPC','^SOX','TSM'].map(symbol=>({symbol,price:101,changePercent:1,date:'2026-10-20',time:'10:02:00',source:'Yahoo Finance',isIntraday:true,asOf:'2026-10-16',market:'US'}))
 ];
 const tw=exploreMarketMarkup({indices,selected:'taiwan',link,favoriteButton});
 assert.match(tw,/台股行情時間：2026-10-20 10:00:00・Fugle・即時行情/);
 assert.match(tw,/台灣 2026-10-20 10:01:00・Yahoo Finance・可能延遲 15 分鐘，非即時/);
 const us=exploreMarketMarkup({indices,selected:'us',link,favoriteButton});
 assert.match(us,/美股行情時間：2026-10-20 10:02:00・Yahoo Finance・可能延遲 15 分鐘，非即時/);
 assert.equal((us.match(/美東 2026-10-20 10:02:00・Yahoo Finance・可能延遲 15 分鐘，非即時/g)||[]).length,5);
});

test('market overview renders evidence-backed market health counts and coverage', async () => {
  const now=Date.now(),day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
  const context={
    state:{rows:[{symbol:'2330',changePercent:2,turnover:100,volume:1},{symbol:'2317',changePercent:-1,turnover:50,volume:2},{symbol:'2303',changePercent:0,turnover:25,volume:3},{symbol:'2357',changePercent:null,turnover:10,volume:4}],indices:[],marketTurnover:{value:1_000_000_000,rowCount:2342,date:day},index:{latest_daily_tw:day}},
    card:(title,body)=>`<article><h2>${title}</h2>${body}</article>`,
    metric:(label,value)=>`<div>${label}: ${value}</div>`,
    link:(id,label)=>`<a href="#/${id}">${label}</a>`,rowList:()=>'',publicData:async()=>({schemaVersion:1,source:'yahoo.chart.1m',generatedAt:new Date(now).toISOString(),indices:[]})
  };
  const html=await marketOverview(context);
  assert.doesNotMatch(html,/<h2>(電子|金融)指數<\/h2>/,'User requested only TAIEX, OTC, and US indices');
  assert.match(html,/<h2>市場健康度<\/h2>/);
  assert.match(html,/漲跌家數: 1：1/);
  assert.match(html,/漲跌比: 1：1/);
  assert.match(html,/平盤: 1/);
  assert.match(html,/以 3 檔具原始參考價證券計算/);
  assert.match(html,/成交金額: 10 億/);
  assert.match(html,/2342 筆完整原始行情列/);
  assert.match(html,/情緒分數不推估/);
  assert.match(html,/<nav class="market-tabs" aria-label="M01 市場頁面">.*市場總覽.*市場熱力圖.*行情排行.*<\/nav>/s);
  const withElectronic={...context,state:{...context.state,indices:[{symbol:'IX0044',name:'電子指數',price:100,change:1,changePercent:1,asOf:day}]}};
  const availableHtml=await marketOverview(withElectronic);
  assert.equal((availableHtml.match(/<h2>電子指數/g)||[]).length,0,'Electronic index is outside requested scope');
  assert.equal((availableHtml.match(/<h2>金融指數/g)||[]).length,0,'Financial index is outside requested scope');
  assert.doesNotMatch(availableHtml,/<h2>(電子|金融)指數<\/h2>/,'Reject indices outside the requested scope');
});

test('market overview does not turn missing eligible rows into zero breadth',async()=>{
 const now=Date.now(),day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
 const context={state:{rows:[],indices:[{symbol:'IX0001',name:'加權指數',price:100,change:0,changePercent:0,asOf:day}],index:{latest_daily_tw:day}},card:(title,body)=>`<article><h2>${title}</h2>${body}</article>`,metric:(label,value)=>`<div>${label}: ${value}</div>`,link:(id,label)=>`<a href="#/${id}">${label}</a>`,rowList:()=>'',publicData:async()=>({schemaVersion:1,source:'yahoo.chart.1m',generatedAt:new Date(now).toISOString(),indices:[]})};
 const html=await marketOverview(context);
 for(const label of ['上漲家數','下跌家數','平盤家數'])assert.match(html,new RegExp(`${label}: 資料不足`));
 assert.match(html,/參考價資料不足，暫無法計算漲跌家數/);
 assert.match(html,/參考價資料不足，暫無法計算漲跌家數/);
});

test('M23 market failure state keeps latest market data visible and offers retry',async()=>{
 const context={state:{rows:[],indices:[{symbol:'IX0001',name:'加權指數',price:100,asOf:'2026-10-16'}],index:{latest_daily_tw:'2026-10-16'}},failureState:true,card:(title,body)=>`<article><h2>${title}</h2>${body}</article>`,metric:(label,value)=>`<div>${label}: ${value}</div>`,link:()=>'',rowList:()=>'',publicData:async()=>({schemaVersion:1,indices:[]})};
 const html=await marketOverview(context);
 assert.match(html,/<section class="card state" role="status">[\s\S]*<h2>市場資料暫不可用<\/h2>/);
 assert.match(html,/保留 Public_Data 最新可用資料與來源日期；重新連線後可重試/);
 assert.match(html,/<button data-action="reload">重試<\/button>/);
 assert.match(html,/<nav class="market-overview-tabs"/,'failure state preserves the market panels');
 assert.match(html,/TAIEX/,'the cached market overview remains available under the failure message');
});

test('market overview separates Taiwan, US, and market-information panels',async()=>{
 const rows=[
  {symbol:'IX0001',name:'加權指數',price:100},
  {symbol:'IX0043',name:'櫃買指數',price:50},
  {symbol:'^DJI',name:'道瓊工業',price:40000},
  {symbol:'^IXIC',name:'NASDAQ',price:18000},
  {symbol:'^GSPC',name:'S&P 500',price:5500},
  {symbol:'^SOX',name:'費城半導體',price:5000},
  {symbol:'TSM',name:'TSM ADR',price:200},
  {symbol:'IX0044',name:'電子指數',price:120},
  {symbol:'IX0045',name:'金融指數',price:80},
 ];
 const context={state:{rows:[],indices:rows,index:{latest_daily_tw:'2026-10-16'}},card:(title,body)=>`<article><h2>${title}</h2>${body}</article>`,metric:(label,value)=>`<div>${label}: ${value}</div>`,link:()=>'',rowList:()=>'',publicData:async()=>({schemaVersion:1,indices:[]})};
 const tw=await marketOverview(context);
 for(const label of ['加權指數 TAIEX','櫃買指數 OTC'])assert.ok(tw.includes(`<h2>${label}</h2>`),label);
 for(const label of ['道瓊工業 ^DJI','NASDAQ ^IXIC','S&P 500 ^GSPC','費城半導體 ^SOX','TSM ADR TSM'])assert.ok(!tw.includes(`<h2>${label}</h2>`),`${label} stays off the Taiwan panel`);
 const us=await marketOverview(context,'overview','us');
 for(const label of ['道瓊工業','NASDAQ','S&amp;P 500','費城半導體','TSM ADR'])assert.ok(us.includes(label),label);
 assert.match(us,/market-us-index-tabs/);
 assert.equal((us.match(/<article><h2>/g)||[]).length,1,'only one selected US index/ADR card is rendered at a time');
 assert.doesNotMatch(us,/<h2>(電子指數|金融指數)/);
 assert.match(tw,/<nav class="market-overview-tabs"[\s\S]*市場總覽[\s\S]*美股[\s\S]*市場資訊/);
});

test('market overview only requests the active market data providers',async()=>{
 const makeContext=()=>{
  const calls={taiwan:0,us:0,paths:[]};
  const context={state:{rows:[],indices:[{symbol:'IX0001',name:'加權指數',price:100,market:'TW'},{symbol:'^SOX',name:'費城半導體指數',price:5000,market:'US'}],index:{latest_daily_tw:'2026-10-16'}},card:(title,body)=>`<article><h2>${title}</h2>${body}</article>`,metric:(label,value)=>`<div>${label}: ${value}</div>`,link:()=>'',rowList:()=>'',publicData:async path=>{calls.paths.push(path);if(path==='meta/calendar.json')return {date:'2026-10-16',data:[]};return {schemaVersion:1,source:'yahoo.chart.1m',generatedAt:new Date().toISOString(),indices:[]};},marketIndexQuotes:async()=>{calls.taiwan++;return {};},marketQuotes:async()=>{calls.us++;return {};}};
  return {context,calls};
 };
 const contextPanel=makeContext();
 await marketOverview(contextPanel.context,'overview','context','calendar');
 assert.deepEqual([contextPanel.calls.taiwan,contextPanel.calls.us],[0,0]);
 assert.ok(!contextPanel.calls.paths.includes('rebuild/index-intraday.json'),'context does not load hidden Taiwan charts');
 const usPanel=makeContext();
 await marketOverview(usPanel.context,'overview','us');
 assert.deepEqual([usPanel.calls.taiwan,usPanel.calls.us],[0,1]);
 assert.ok(!usPanel.calls.paths.includes('rebuild/index-intraday.json'),'US does not load hidden Taiwan charts');
 const taiwanPanel=makeContext();
 await marketOverview(taiwanPanel.context,'overview','taiwan');
 assert.deepEqual([taiwanPanel.calls.taiwan,taiwanPanel.calls.us],[1,0]);
 assert.equal(taiwanPanel.calls.paths.filter(path=>path==='rebuild/index-intraday.json').length,1);
});

test('all five US market cards remain visible when some symbols lack source rows',async()=>{
 const context={state:{rows:[],indices:[
  {symbol:'IX0001',name:'加權指數',price:100,market:'TW'},
  {symbol:'IX0043',name:'櫃買指數',price:50,market:'TW'},
  {symbol:'^SOX',name:'費城半導體指數',price:5000,market:'US',asOf:'2026-10-15'}
 ],index:{latest_daily_tw:'2026-10-16'}},card:(title,body)=>`<article><h2>${title}</h2>${body}</article>`,metric:(label,value)=>`<div>${label}: ${value}</div>`,link:()=>'',rowList:()=>'',publicData:async()=>({schemaVersion:1,indices:[]})};
 const html=await marketOverview(context,'overview','us');
 for(const label of ['道瓊工業指數','NASDAQ 綜合指數','S&amp;P 500 指數','費城半導體指數','TSM ADR'])assert.ok(html.includes(label),label);
 assert.equal((html.match(/美東交易日期／Public_Data 報價資料不足/g)||[]).length,0,'only the selected source row is rendered at a time');
 for(const symbol of ['^DJI','^IXIC','^GSPC','^SOX','TSM']){
  const selected=await marketOverview(context,'overview','us','risk','margin_pressure_highest',symbol);
  if(symbol==='^SOX')assert.match(selected,/美東交易日期 2026-10-15/);
  else assert.match(selected,/美東交易日期／Public_Data 報價資料不足/);
 }
});

test('market index cards identify exchange-local dates for Taiwan and US sources',async()=>{
 const now=Date.now(),day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
 const context={state:{rows:[],indices:[
  {symbol:'IX0001',name:'加權指數',price:100,change:1,changePercent:1,asOf:'2026-10-16',market:'TW'},
  {symbol:'^DJI',name:'道瓊工業指數',price:200,asOf:'2026-10-15',market:'US'},
  {symbol:'^IXIC',name:'NASDAQ 綜合指數',price:200,asOf:'2026-10-15',market:'US'},
  {symbol:'^GSPC',name:'S&P 500 指數',price:200,asOf:'2026-10-15',market:'US'},
  {symbol:'^SOX',name:'費城半導體指數',price:200,change:-2,changePercent:-1,asOf:'2026-10-15',market:'US'},
  {symbol:'TSM',name:'台積電 ADR',price:200,asOf:'2026-10-15',market:'US'}
 ],index:{latest_daily_tw:day}},card:(title,body)=>`<article><h2>${title}</h2>${body}</article>`,metric:(label,value)=>`<div>${label}: ${value}</div>`,link:(id,label)=>`<a href="#/${id}">${label}</a>`,rowList:()=>'',publicData:async()=>({schemaVersion:1,source:'yahoo.chart.1m',generatedAt:new Date(now).toISOString(),indices:[]})};
 for(const symbol of ['^DJI','^IXIC','^GSPC','^SOX','TSM']){
  const html=await marketOverview(context,'overview','us','risk','margin_pressure_highest',symbol);
  assert.equal((html.match(/美東交易日期 2026-10-15/g)||[]).length,1,`${symbol} uses the US-local source date`);
  assert.equal((html.match(/data-exchange-clock="US"/g)||[]).length,1,`${symbol} shows the exchange-local clock`);
 }
 const twHtml=await marketOverview(context,'overview','taiwan');
 assert.match(twHtml,/台灣交易日期 2026-10-16/);
 assert.equal((twHtml.match(/data-exchange-clock="TW"/g)||[]).length,1,'the available Taiwan index card shows Taiwan-local time');
});

test('market overview labels live quotes separately on all five US cards',async()=>{
 const symbols=['^DJI','^IXIC','^GSPC','^SOX','TSM'],names=['道瓊工業指數','NASDAQ 綜合指數','S&P 500 指數','費城半導體指數','台積電 ADR'];
 const context={state:{rows:[],indices:symbols.map((symbol,index)=>({symbol,name:names[index],price:100,change:1,changePercent:1,asOf:'2026-10-16',market:'US'})),index:{latest_daily_tw:'2026-10-16'}},card:(title,body)=>`<article><h2>${title}</h2>${body}</article>`,metric:(label,value)=>`<div>${label}: ${value}</div>`,link:()=>'',rowList:()=>'',publicData:async()=>({schemaVersion:1,source:'yahoo.chart.1m',generatedAt:'2026-10-20T15:00:00.000Z',indices:[]}),marketQuotes:async()=>Object.fromEntries(symbols.map(symbol=>[symbol,{symbol,price:101,change:1,changePercent:1,date:'2026-10-20',time:'11:00:00',source:'Yahoo Finance',isIntraday:true}]))};
 for(let i=0;i<symbols.length;i++){
  const html=await marketOverview(context,'overview','us','risk','margin_pressure_highest',symbols[i]);
  assert.equal((html.match(/Yahoo Finance・可能延遲 15 分鐘，非即時/g)||[]).length,1);
  assert.equal((html.match(/美東 2026-10-20 11:00:00/g)||[]).length,1);
  assert.equal((html.match(/data-exchange-clock="US"/g)||[]).length,1);
  assert.ok(html.includes(names[i].replace('&','&amp;')));
 }
});

test('market information reads canonical risk, margin ranking, and calendar JSON by tab',async()=>{
 const state={rows:[{symbol:'2330',name:'台積電'}],listing:{stocks:{'2330':{name:'台積電'}}},indices:[],index:{latest_daily_tw:'2026-10-16',available_days_tw_market_margin:['2026-10-15','2026-10-16']}};
 const payloads={
  'meta/market_risk.json':{stocks:[{date:'2026-10-16',risk_score:51,status:'平穩',retail_sentiment:'中性',margin_balance:100000000000,margin_ma20:90000000000,maintenance_rate:180}]},
  'meta/market_divergence_alert.json':{stocks:[{date:'2026-10-16',bias5:1.2,vol_ratio:1.1,is_alert:false,crash_probability:0.1}]},
  'meta/market_margin_history.json':{history:[{date:'2026-10-15',maintenance_rate:175},{date:'2026-10-16',maintenance_rate:180}]},
  'daily/tw_market_margin/2026-10-15.json':{stocks:[{date:'2026-10-15',total_margin_balance:790000000000,total_margin_change:1000000000,total_short_balance:250000}]},
  'daily/tw_market_margin/2026-10-16.json':{stocks:[{date:'2026-10-16',total_margin_balance:798000000000,total_margin_change:8000000000,total_short_balance:258000}]},
  'quant/margin_stock_rankings.json':{date:'2026-10-16',margin_pressure_highest:[{stock_id:'2330',name:'2330',value:40}]},
  'meta/calendar.json':{date:'2026-10-16',data:[[`${taipeiToday()}`,'測試開市','來源備註']]}
 };
 function taipeiToday(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
 const context={state,card:(title,body)=>`<article><h2>${title}</h2>${body}</article>`,metric:(label,value)=>`<div>${label}: ${value}</div>`,favoriteButton:(symbol,name)=>`<button>${name} ${symbol} ☆</button>`,publicData:async path=>payloads[path]};
 const risk=await marketOverview(context,'overview','context','risk');
 for(const subsection of ['margin-risk','divergence','maintenance-history','daily-margin'])assert.ok(risk.includes(`subsection=${subsection}`),subsection);
 assert.ok(risk.indexOf('aria-label="市場資訊分頁"')<risk.indexOf('aria-label="市場風險資料分頁"'),'parent tabs must precede their nested risk sub-tabs');
 assert.match(risk,/大盤資券風險/);assert.doesNotMatch(risk,/大盤乖離警示/);assert.doesNotMatch(risk,/融資維持率歷史/);
 const divergence=await marketOverview(context,'overview','context','risk','margin_pressure_highest','^SOX','divergence');
 assert.match(divergence,/大盤乖離警示/);assert.doesNotMatch(divergence,/大盤資券風險/);
 const maintenance=await marketOverview(context,'overview','context','risk','margin_pressure_highest','^SOX','maintenance-history');
 assert.match(maintenance,/融資維持率歷史/);assert.match(maintenance,/2026-10-16/);assert.doesNotMatch(maintenance,/大盤每日資券餘額/);
 const dailyMargin=await marketOverview(context,'overview','context','risk','margin_pressure_highest','^SOX','daily-margin');
 assert.match(dailyMargin,/大盤每日資券餘額・Public_Data/);assert.match(dailyMargin,/2026-10-16/);assert.match(dailyMargin,/7,980 億元/);assert.doesNotMatch(dailyMargin,/大盤資券風險/);
 const ranking=await marketOverview(context,'overview','context','ranking');
 assert.match(ranking,/台積電 <small>2330<\/small>/);assert.match(ranking,/category=margin_increase_5d/);
 const calendar=await marketOverview(context,'overview','context','calendar');
 assert.match(calendar,/測試開市/);assert.match(calendar,/來源備註/);
});

test('market overview labels TAIEX and OTC live source and Taiwan-local time independently',async()=>{
 const symbols=[['IX0001','加權指數'],['IX0043','櫃買指數']];
 const context={state:{rows:[],indices:symbols.map(([symbol,name])=>({symbol,name,price:100,change:1,changePercent:1,asOf:'2026-10-16',market:'TW'})),index:{latest_daily_tw:'2026-10-16'}},card:(title,body)=>`<article><h2>${title}</h2>${body}</article>`,metric:(label,value)=>`<div>${label}: ${value}</div>`,link:()=>'',rowList:()=>'',publicData:async()=>({schemaVersion:1,indices:[]}),marketIndexQuotes:async()=>({IX0001:{symbol:'IX0001',price:101,change:1,changePercent:1,date:'2026-10-16',time:'10:30:00',source:'Fugle',isIntraday:true},IX0043:{symbol:'IX0043',price:101,change:1,changePercent:1,date:'2026-10-16',time:'10:31:00',source:'Yahoo Finance',isIntraday:true}})};
 const html=await marketOverview(context);
 assert.match(html,/台灣 2026-10-16 10:30:00・Fugle・即時行情/);
 assert.match(html,/台灣 2026-10-16 10:31:00・Yahoo Finance・可能延遲 15 分鐘，非即時/);
});
