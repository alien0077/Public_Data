import test from 'node:test';
import assert from 'node:assert/strict';
import {aggregateIntradayRows,calendarConfirmsMarketOpen,createServicesModule,hasPreOpenCalendarConfirmation,hasSameDayOpenMarketConfirmation,isPreOpenCalendarRefreshWindow,readIntraday,readYahooIntraday,readYahooUSMarketQuote,readYahooTWIndexQuote,readYahooMarketSnapshot,readFugleIndexMessage,renderValuationEvidenceTabs,isTaiwanTradingDateAfterOpen,isTaiwanTradingSession,reserveRequestWindow} from './services.mjs';
import {taipeiDay} from './core.mjs';

function storage(seed={}){const values=new Map(Object.entries(seed));return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),values};}

test('Fugle local window allows the configured request budget but blocks the next call',()=>{
 const now=100_000, s=storage({calls:JSON.stringify(Array.from({length:19},(_,i)=>now-1000+i))});
 assert.equal(reserveRequestWindow(s,'calls',now,20,60_000),true);
 assert.equal(JSON.parse(s.values.get('calls')).length,20);
 assert.equal(reserveRequestWindow(s,'calls',now+1,20,60_000),false);
});

test('Fugle request window discards expired entries and persists the new reservation',()=>{
 const now=70_000,s=storage({calls:JSON.stringify([now-60_001,now-1])});
 assert.equal(reserveRequestWindow(s,'calls',now,20,60_000),true);
 assert.deepEqual(JSON.parse(s.values.get('calls')),[now-1,now]);
});

test('Fugle request window fails closed for corrupt state or unavailable storage',()=>{
 assert.equal(reserveRequestWindow(storage({calls:'not-json'}),'calls',1,20,60_000),false);
 const unavailable={getItem(){throw Error('blocked')}};
 assert.equal(reserveRequestWindow(unavailable,'calls',1,20,60_000),false);
});

test('Fugle request window fails closed if the device clock moves backwards',()=>{
 const s=storage({calls:JSON.stringify([20_000])});
 assert.equal(reserveRequestWindow(s,'calls',10_000,1,60_000),false);
});


test('Fugle intraday accepts only same-day bars with validated identity and unique timestamps',()=>{
 const today=taipeiDay(),prior=taipeiDay(new Date(Date.now()-86400000));
 const candle=(date,minute=0)=>({date:`${date}T09:${String(minute).padStart(2,'0')}:00.000+08:00`,open:100,high:102,low:99,close:101,volume:5});
 const parsed=readIntraday({symbol:'2330',date:today,data:[candle(today,0),candle(today,1)]},'2330');
 assert.deepEqual(parsed.days,[today]);assert.equal(parsed.date,today);assert.deepEqual(parsed.rows.map(row=>row.day),[today,today]);
 assert.throws(()=>readIntraday({symbol:'2317',date:today,data:[candle(today)]},'2330'),/身份或日期/);
 assert.throws(()=>readIntraday({symbol:'2330',date:today,data:[candle(today),candle(today)]},'2330'),/格式不符/);
 assert.throws(()=>readIntraday({symbol:'2330',date:prior,data:[candle(prior)]},'2330'),/身份或日期/);
 assert.throws(()=>readIntraday({symbol:'2330',date:today,data:[candle(today),candle(prior)]},'2330'),/只允許本日/);
 assert.throws(()=>readIntraday({symbol:'2330',date:today,data:Array.from({length:2001},(_,i)=>candle(today,i%60))},'2330'),/身份或日期/);
});

test('calendar reload is required in the exchange-specific 30-minute pre-open window',()=>{
 assert.equal(isPreOpenCalendarRefreshWindow(new Date('2026-10-20T08:29:00+08:00'),false),false);
 assert.equal(isPreOpenCalendarRefreshWindow(new Date('2026-10-20T08:30:00+08:00'),false),true);
 assert.equal(isPreOpenCalendarRefreshWindow(new Date('2026-10-20T08:59:00+08:00'),false),true);
 assert.equal(isPreOpenCalendarRefreshWindow(new Date('2026-10-20T09:00:00+08:00'),false),false);
 assert.equal(isPreOpenCalendarRefreshWindow(new Date('2026-10-20T09:00:00-04:00'),true),true);
 assert.equal(isPreOpenCalendarRefreshWindow(new Date('2026-10-20T09:30:00-04:00'),true),false);
});

test('exchange schedule is unchanged when the same instant is viewed from Japan',()=>{
 // Each pair represents the same instant with a different displayed UTC offset.
 assert.equal(new Date('2026-10-20T09:30:00+09:00').getTime(),new Date('2026-10-20T08:30:00+08:00').getTime());
 assert.equal(isPreOpenCalendarRefreshWindow(new Date('2026-10-20T09:30:00+09:00'),false),true);
 assert.equal(isPreOpenCalendarRefreshWindow(new Date('2026-10-20T22:00:00+09:00'),true),true);
 const calendar={meta:{today:{tw:{date:'2026-10-20',is_closed:false},us:{date:'2026-10-20',is_closed:false}},years:{'2026':{tw:[],us:[]}}}};
 assert.equal(calendarConfirmsMarketOpen(calendar,new Date('2026-10-20T09:30:00+09:00'),false),true);
 assert.equal(calendarConfirmsMarketOpen(calendar,new Date('2026-10-20T22:00:00+09:00'),true),true);
});

test('live-market authorization requires a same-date calendar fetched during that exchange pre-open window',()=>{
 const calendar={meta:{today:{tw:{date:'2026-10-20',is_closed:false},us:{date:'2026-10-20',is_closed:false}},years:{'2026':{tw:[],us:[]}}}};
 const taiwanNow=new Date('2026-10-20T10:00:00+08:00');
 assert.equal(hasPreOpenCalendarConfirmation({date:'2026-10-20',calendar,confirmed:true,checkedAt:Date.parse('2026-10-20T08:59:00+08:00')},taiwanNow,false),true);
 assert.equal(hasPreOpenCalendarConfirmation({date:'2026-10-20',calendar,confirmed:true,checkedAt:Date.parse('2026-10-20T09:01:00+08:00')},taiwanNow,false),false);
 assert.equal(hasPreOpenCalendarConfirmation({date:'2026-10-19',calendar,confirmed:true,checkedAt:Date.parse('2026-10-20T08:59:00+08:00')},taiwanNow,false),false);
 assert.equal(hasPreOpenCalendarConfirmation({date:'2026-10-20',calendar,confirmed:false,checkedAt:Date.parse('2026-10-20T08:59:00+08:00')},taiwanNow,false),false);
 const usNow=new Date('2026-10-20T10:00:00-04:00');
 assert.equal(hasPreOpenCalendarConfirmation({date:'2026-10-20',calendar,confirmed:true,checkedAt:Date.parse('2026-10-20T09:29:00-04:00')},usNow,true),true);
 assert.equal(hasPreOpenCalendarConfirmation({date:'2026-10-20',calendar,confirmed:true,checkedAt:Date.parse('2026-10-20T09:31:00-04:00')},usNow,true),false);
});

test('market quote services use the Public_Data Yahoo snapshot and never call browser Yahoo endpoints',async()=>{
 const NativeDate=globalThis.Date,previous={window:globalThis.window,localStorage:globalThis.localStorage,fetch:globalThis.fetch},fixedNow=Date.parse('2026-10-20T10:00:00-04:00');
 let calendarReads=0,snapshotReads=0,providerReads=0;
 globalThis.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[fixedNow]));}static now(){return fixedNow;}};
 globalThis.localStorage=storage();globalThis.window={addEventListener(){},setInterval(){return 1;}};
 globalThis.fetch=async()=>{providerReads++;throw new Error('browser Yahoo direct request forbidden');};
 const twTimestamp=Date.parse('2026-10-20T13:30:00+08:00')/1000,usTimestamp=fixedNow/1000;
 const snapshot={schemaVersion:1,source:'yahoo.chart.1m',generatedAt:new Date(fixedNow).toISOString(),quotes:[
  ...['IX0001','IX0043'].map(symbol=>({symbol,market:'tw',source:'Yahoo Finance',dataDate:'2026-10-20',timestamp:twTimestamp,price:101,previousClose:100})),
  ...['^DJI','^IXIC','^GSPC','^SOX','TSM'].map(symbol=>({symbol,market:'us',source:'Yahoo Finance',dataDate:'2026-10-20',timestamp:usTimestamp,price:101,previousClose:100})),
 ]};
 try{
  const module=createServicesModule({state:{indices:[]},publicData:async(path,options)=>{
   if(path==='meta/calendar.json'){calendarReads++;assert.equal(options.reload,true);return {meta:{today:{tw:{date:'2026-10-20',is_closed:false},us:{date:'2026-10-20',is_closed:false}},years:{'2026':{tw:[],us:[]}}}};}
   if(path==='rebuild/index-intraday.json'){snapshotReads++;return snapshot;}
   throw Error('unexpected Public_Data path '+path);
  }});
  const us=await module.marketQuotes({indices:[]}),tw=await module.marketIndexQuotes({indices:[]});
  assert.equal(Object.keys(us).length,5);assert.ok(Object.values(us).every(item=>item.source==='Yahoo Finance'));
  assert.equal(Object.keys(tw).length,2);assert.ok(Object.values(tw).every(item=>item.source==='Yahoo Finance'));
  assert.equal(calendarReads,2,'one fresh calendar reload for each exchange');
  assert.equal(snapshotReads,2,'one canonical Yahoo snapshot read per market');
  assert.equal(providerReads,0,'the browser makes no direct Yahoo request');
 }finally{
  globalThis.Date=NativeDate;
  for(const key of Object.keys(previous)){if(previous[key]===undefined)delete globalThis[key];else globalThis[key]=previous[key];}
 }
});

test('canonical calendar confirms only the exact market date and rejects holidays or stale dates',()=>{
 const calendar={meta:{today:{tw:{date:'2026-10-20',is_closed:false},us:{date:'2026-10-20',is_closed:false}},years:{'2026':{tw:['2026-10-19'],us:['2026-11-26']}}}};
 assert.equal(calendarConfirmsMarketOpen(calendar,new Date('2026-10-20T10:00:00+08:00'),false),true);
 assert.equal(calendarConfirmsMarketOpen(calendar,new Date('2026-10-19T10:00:00+08:00'),false),false);
 assert.equal(calendarConfirmsMarketOpen(calendar,new Date('2026-10-20T10:00:00+08:00'),true),false);
 assert.equal(calendarConfirmsMarketOpen({...calendar,meta:{...calendar.meta,today:{...calendar.meta.today,tw:{date:'2026-10-20',is_closed:false}},years:{'2026':{tw:['2026-10-20'],us:[]}}}},new Date('2026-10-20T10:00:00+08:00'),false),false);
});

test('same-day recovered calendar may authorize quotes but stale, future, or closed dates may not',()=>{
 const calendar={meta:{today:{tw:{date:'2026-10-20',is_closed:false}},years:{'2026':{tw:[],us:[]}}}},now=new Date('2026-10-20T14:00:00+08:00');
 assert.equal(hasSameDayOpenMarketConfirmation({date:'2026-10-20',calendar,confirmed:true,checkedAt:Date.parse('2026-10-20T14:00:00+08:00')},now,false),true);
 assert.equal(hasSameDayOpenMarketConfirmation({date:'2026-10-19',calendar,confirmed:true,checkedAt:Date.parse('2026-10-19T08:59:00+08:00')},now,false),false);
 assert.equal(hasSameDayOpenMarketConfirmation({date:'2026-10-20',calendar,confirmed:true,checkedAt:now.getTime()+300_000},now,false),false);
 assert.equal(isTaiwanTradingDateAfterOpen(now,calendar),true);
 assert.equal(isTaiwanTradingDateAfterOpen(new Date('2026-10-20T08:59:00+08:00'),calendar),false);
 assert.equal(isTaiwanTradingDateAfterOpen(now,{meta:{today:{tw:{date:'2026-10-20',is_closed:true}},years:{'2026':{tw:[],us:[]}}}}),false);
});

test('Yahoo fallback requires a canonical same-day calendar confirmation and an open session',()=>{
 const calendar={meta:{today:{tw:{date:'2026-10-20',is_closed:false}},years:{'2026':{tw:[],us:[]}}}};
 assert.equal(isTaiwanTradingSession(new Date('2026-10-18T10:00:00+08:00'),calendar),false);
 assert.equal(isTaiwanTradingSession(new Date('2026-10-19T10:00:00+08:00'),calendar),false);
 assert.equal(isTaiwanTradingSession(new Date('2026-10-20T08:59:00+08:00'),calendar),false);
 assert.equal(isTaiwanTradingSession(new Date('2026-10-20T10:00:00+08:00'),calendar),true);
 assert.equal(isTaiwanTradingSession(new Date('2026-10-20T13:31:00+08:00'),calendar),false);
 assert.equal(isTaiwanTradingSession(new Date('2026-10-20T10:00:00+08:00'),{meta:{today:{tw:{date:'2026-10-19',is_closed:false}},years:{'2026':{tw:[],us:[]}}}}),false);
});

test('Yahoo US index quote accepts only a matching, fresh exchange-local session quote',()=>{
 const symbol='^SOX',now=new Date('2026-10-20T15:00:00Z'),regularMarketTime=Math.floor(Date.parse('2026-10-20T14:59:00Z')/1000);
 const payload={chart:{result:[{meta:{symbol,regularMarketTime,regularMarketPrice:5001,chartPreviousClose:4950}}]}};
 const quote=readYahooUSMarketQuote(payload,symbol,now);
 assert.equal(quote.date,'2026-10-20');assert.equal(quote.time,'10:59:00');assert.equal(quote.source,'Yahoo Finance');assert.equal(quote.isIntraday,true);assert.equal(quote.change,51);
 assert.throws(()=>readYahooUSMarketQuote(payload,'^DJI',now),/身份不符/);
 assert.throws(()=>readYahooUSMarketQuote(payload,symbol,new Date('2026-10-20T15:31:00Z')),/時間過舊/);
});

test('Taiwan Yahoo index fallback validates both index identities, local date and freshness',()=>{
 const now=new Date('2026-10-20T02:00:00Z'),regularMarketTime=Math.floor(Date.parse('2026-10-20T01:59:00Z')/1000);
 for(const [symbol,yahooSymbol] of [['IX0001','^TWII'],['IX0043','^TWOII']]){
  const payload={chart:{result:[{meta:{symbol:yahooSymbol,regularMarketTime,regularMarketPrice:25001,chartPreviousClose:24900}}]}};
  const quote=readYahooTWIndexQuote(payload,symbol,now);assert.equal(quote.date,'2026-10-20');assert.equal(quote.source,'Yahoo Finance');assert.equal(quote.isIntraday,true);assert.equal(quote.change,101);
  assert.throws(()=>readYahooTWIndexQuote(payload,symbol,new Date('2026-10-20T02:31:00Z')),/時間過舊/);
 }
 assert.throws(()=>readYahooTWIndexQuote({chart:{result:[{meta:{symbol:'^DJI',regularMarketTime,regularMarketPrice:1,chartPreviousClose:1}}]}},'IX0001',now),/身份不符/);
});

test('Yahoo Public_Data snapshot validates market, symbol, exchange date, and source quote time',()=>{
 const twNow=new Date('2026-10-20T02:00:00Z'),usNow=new Date('2026-10-20T15:00:00Z');
 const twTimestamp=Date.parse('2026-10-20T01:59:00Z')/1000,usTimestamp=Date.parse('2026-10-20T14:59:00Z')/1000;
 const twRow={symbol:'IX0001',market:'tw',source:'Yahoo Finance',dataDate:'2026-10-20',timestamp:twTimestamp,price:25001,previousClose:24900};
 const usRow={symbol:'^SOX',market:'us',source:'Yahoo Finance',dataDate:'2026-10-20',timestamp:usTimestamp,price:5001,previousClose:4950};
 const snapshot=(generatedAt,quotes)=>({schemaVersion:1,source:'yahoo.chart.1m',generatedAt,quotes});
 const twSnapshot=snapshot('2026-10-20T01:59:30Z',[twRow]),usSnapshot=snapshot('2026-10-20T14:59:30Z',[usRow]);
 const tw=readYahooMarketSnapshot(twSnapshot,'IX0001',twNow),us=readYahooMarketSnapshot(usSnapshot,'^SOX',usNow);
 assert.equal(tw.source,'Yahoo Finance');assert.equal(tw.time,'09:59:00');assert.equal(tw.change,101);assert.equal(tw.isIntraday,true);
 assert.equal(us.source,'Yahoo Finance');assert.equal(us.time,'10:59:00');assert.equal(us.change,51);assert.equal(us.isIntraday,true);
 assert.throws(()=>readYahooMarketSnapshot(snapshot('bad',[twRow]),'IX0001',twNow),/快照時間/);
 assert.throws(()=>readYahooMarketSnapshot(snapshot('2026-10-20T02:02:00Z',[twRow]),'IX0001',twNow),/快照時間/);
 assert.throws(()=>readYahooMarketSnapshot(snapshot('2026-10-20T01:59:30Z',[twRow,{...twRow}]),'IX0001',twNow),/重複/);
 assert.throws(()=>readYahooMarketSnapshot(snapshot('2026-10-20T01:59:30Z',[{...twRow,symbol:'^SOX',market:'us'}]),'^SOX',twNow),/市場或日期/);
 assert.throws(()=>readYahooMarketSnapshot(snapshot('2026-10-20T01:59:30Z',[{...twRow,dataDate:'2026-10-19'}]),'IX0001',twNow),/市場或日期/);
 assert.throws(()=>readYahooMarketSnapshot(snapshot('2026-10-20T01:59:30Z',[{...twRow,timestamp:twTimestamp-3600}]),'IX0001',twNow),/報價過舊/);
 assert.throws(()=>readYahooMarketSnapshot(snapshot('2026-10-20T01:59:30Z',[{...twRow,timestamp:twTimestamp+120}]),'IX0001',twNow),/晚於快照時間/);
});

test('Fugle Taiwan indices parser accepts authenticated index payload shape and rejects stale or wrong exchange',()=>{
 const now=new Date('2026-10-20T02:00:00Z'),time=Date.parse('2026-10-20T01:59:00Z')/1000,mapping={TWSE:'IR0001',TPEX:'IR0043'};
 const message={event:'data',channel:'indices',data:{type:'INDEX',symbol:'IR0001',exchange:'TWSE',index:27001,time}};
 const quote=readFugleIndexMessage(message,mapping,now);assert.equal(quote.symbol,'IX0001');assert.equal(quote.price,27001);assert.equal(quote.source,'Fugle');assert.equal(quote.isIntraday,true);
 assert.throws(()=>readFugleIndexMessage({...message,data:{...message.data,exchange:'TPEX'}},mapping,now),/身份不符/);
 assert.throws(()=>readFugleIndexMessage({...message,data:{...message.data,time:time-3600}},mapping,now),/日期或時間不符/);
});

test('M15 valuation evidence navigation exposes five accessible panels and opens only the overview',()=>{
 const html=renderValuationEvidenceTabs('2330',[['overview','概覽','<p>總覽內容</p>'],['inputs','輸入','<p>輸入內容</p>'],['models','模型','<p>模型內容</p>'],['drivers','驅動','<p>驅動內容</p>'],['quality','品質','<p>品質內容</p>']]);
 assert.equal((html.match(/role="tab"/g)||[]).length,5);assert.equal((html.match(/role="tabpanel"/g)||[]).length,5);
 assert.match(html,/aria-selected="true" tabindex="0"/);assert.equal((html.match(/ hidden>/g)||[]).length,4);assert.match(html,/aria-controls="valuation-panel-2330-inputs"/);assert.match(html,/data-valuation-panel="quality"/);
});

test('Yahoo chart fallback uses raw quote close, validates symbol, and keeps only same-day regular-session bars',()=>{
 const today=taipeiDay(),open=Date.parse(`${today}T09:00:00+08:00`)/1000,close=Date.parse(`${today}T13:31:00+08:00`)/1000,prior=Date.parse(`${taipeiDay(new Date(Date.now()-86400000))}T10:00:00+08:00`)/1000;
 const payload={chart:{result:[{meta:{symbol:'2330.TW'},timestamp:[open,close,prior],indicators:{quote:[{open:[100,101,99],high:[102,102,100],low:[99,100,98],close:[101,101,99],volume:[10,20,30]}],adjclose:[{adjclose:[1,1,1]}]}}]}};
 const parsed=readYahooIntraday(payload,'2330','TWSE');assert.equal(parsed.rows.length,1);assert.equal(parsed.rows[0].close,101);assert.equal(parsed.rows[0].volume,10);
 assert.throws(()=>readYahooIntraday(payload,'2317','TWSE'),/身份或回應格式/);
 assert.throws(()=>readYahooIntraday(payload,'2330','TPEX'),/身份或回應格式/);
});

test('Yahoo intraday parser exposes a same-day raw quote with Taiwan-local time',()=>{
 const today=taipeiDay(),regularMarketTime=Math.floor(Date.now()/1000),open=Date.parse(today+'T09:00:00+08:00')/1000;
 const payload={chart:{result:[{meta:{symbol:'2330.TW',regularMarketTime,regularMarketPrice:101,chartPreviousClose:99},timestamp:[open],indicators:{quote:[{open:[100],high:[102],low:[99],close:[101],volume:[50]}]}}]}};
 const parsed=readYahooIntraday(payload,'2330','TWSE',today);
 assert.equal(parsed.quote.price,101);assert.equal(parsed.quote.change,2);assert.equal(parsed.quote.date,today);assert.match(parsed.quote.time,/^\d{2}:\d{2}:\d{2}$/);
});

test('Web stock intraday uses the restricted N100 endpoint and renders Yahoo quote plus delay label',async()=>{
 const NativeDate=globalThis.Date,previous={window:globalThis.window,localStorage:globalThis.localStorage,fetch:globalThis.fetch};
 const fixedNow=Date.parse('2026-10-20T10:02:00+08:00'),today='2026-10-20';
 const calendar={meta:{today:{tw:{date:today,is_closed:false}},years:{'2026':{tw:[]}}}};
 const confirmation={date:today,calendar,confirmed:true,checkedAt:Date.parse('2026-10-20T08:59:00+08:00')};
 const values=new Map([['rebuild.calendar.preopen.result.v1.tw',JSON.stringify(confirmation)]]);
 globalThis.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[fixedNow]));}static now(){return fixedNow;}};
 globalThis.localStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
 globalThis.window={addEventListener(){},setInterval(){return 1;}};
 let request;
 const open=Date.parse(today+'T09:00:00+08:00')/1000,regularMarketTime=Math.floor(Date.parse(today+'T10:01:00+08:00')/1000);
 const payload={chart:{result:[{meta:{symbol:'2330.TW',regularMarketTime,regularMarketPrice:101,chartPreviousClose:99},timestamp:[open],indicators:{quote:[{open:[100],high:[102],low:[99],close:[101],volume:[50]}]}}]}};
 globalThis.fetch=async(url,options)=>{request={url,options};return {ok:true,json:async()=>payload};};
 try{
  const module=createServicesModule({state:{listing:{cutoff:today,validThrough:today,stocks:{'2330':{status:'LISTED',eligible:true,market:'TWSE'}}}},card:(title,body)=>'<article>'+title+body+'</article>',metric:(label,value)=>'<span>'+label+':'+value+'</span>',status:(title,message)=>title+':'+message,link:()=>'',publicData:async()=>calendar});
  const html=await module.intraday('2330',{symbol:'2330',name:'台積電',asOf:'2026-10-16'});
  assert.ok(request.url.includes('https://acer-worker.tail5f9e3f.ts.net/v1/market/yahoo/chart?symbol=2330'));
  assert.equal(request.options.mode,'cors');assert.equal(request.options.credentials,'omit');
  assert.match(html,/Yahoo 最新報價 101/);assert.match(html,/可能延遲 15 分鐘，非即時/);assert.match(html,/Yahoo Finance 本日 1 分原始 OHLCV/);
 }finally{globalThis.Date=NativeDate;for(const key of Object.keys(previous)){if(previous[key]===undefined)delete globalThis[key];else globalThis[key]=previous[key];}}
});

test('Yahoo request budget enforces one per symbol and ten globally per rolling minute',()=>{
 const now=100_000,s=storage();for(let i=0;i<10;i++)assert.equal(reserveRequestWindow(s,`yahoo-${i}`,now,1,60_000),true);
 const global=storage({all:JSON.stringify(Array.from({length:10},(_,i)=>now-100+i))});assert.equal(reserveRequestWindow(global,'all',now,10,60_000),false);
 const perSymbol=storage({symbol:JSON.stringify([now-1])});assert.equal(reserveRequestWindow(perSymbol,'symbol',now,1,60_000),false);
});

test('Fugle minute bars aggregate into 5/15/30/60 minute OHLCV without crossing Taipei dates',()=>{
 const row=(date,minute,open,high,low,close,volume)=>({time:Date.parse(`${date}T09:${String(minute).padStart(2,'0')}:00+08:00`),day:date,open,high,low,close,volume});
 const source=[row('2026-10-14',0,100,102,99,101,10),row('2026-10-14',4,101,104,100,103,20),row('2026-10-14',5,103,105,102,104,30),row('2026-10-15',0,200,202,199,201,40)];
 const five=aggregateIntradayRows(source,5);
 assert.equal(five.length,3);
 assert.deepEqual(five.slice(0,2).map(({open,high,low,close,volume})=>({open,high,low,close,volume})),[{open:100,high:104,low:99,close:103,volume:30},{open:103,high:105,low:102,close:104,volume:30}]);
 assert.equal(five[2].day,'2026-10-15');
 assert.deepEqual(aggregateIntradayRows(source,1),source);
 assert.throws(()=>aggregateIntradayRows(source,10),/週期不支援/);
});


test('saved service credentials render as escaped masked values and clear from the page session',async()=>{
 const previousWindow=globalThis.window;
 globalThis.window={addEventListener(){}};
 try{
  const ctx={card:(_title,html)=>html,state:{listing:null},refresh:async()=>{}};
  const module=createServicesModule(ctx),input={value:'<synthetic>&"key',type:'password',getAttribute:name=>name==='aria-label'?'Fugle API Key':null};
  const reveal={textContent:'顯示',setAttribute(){}};
  const handlers={},app={addEventListener:(name,fn)=>{handlers[name]=fn},querySelector:selector=>selector.includes('name=')?input:selector.includes('data-service-reveal')?reveal:null,querySelectorAll:()=>[input]};
  const initialHtml=module.page();
  assert.match(initialHtml,/基礎網址/);
  assert.match(initialHtml,/https:\/\/api\.fugle\.tw/);
  assert.match(initialHtml,/模型版本/);
  assert.match(initialHtml,/gemini-2\.5-flash/);
  assert.match(initialHtml,/最後測試/);
  assert.match(initialHtml,/新版財務資料只使用 Public_Data/);
  assert.match(initialHtml,/<button type="button" disabled aria-describedby="finmind-test-policy" title="新版財務資料只使用 Public_Data/);
  module.listen(app);
  const saveTarget={closest:selector=>selector==='[data-service-save]'?{dataset:{serviceSave:'fugle'}}:null};
  await handlers.click({target:saveTarget});
  let html=module.page();
  assert.match(html,/type="password" name="fugle" value="&lt;synthetic&gt;&amp;&quot;key"/);
  assert.doesNotMatch(html,/<synthetic>&"key/);
  const clearTarget={closest:selector=>selector==='[data-service-clear]'?{dataset:{serviceClear:'fugle'}}:null};
  await handlers.click({target:clearTarget});
  html=module.page();
  assert.match(html,/type="password" name="fugle" value=""/);
  assert.doesNotMatch(html,/synthetic/);
 }finally{
  if(previousWindow===undefined)delete globalThis.window;else globalThis.window=previousWindow;
 }
});
