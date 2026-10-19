import {escapeHTML as e,number as n,resolveListingStatus,taipeiDay,readChart,calculatePriceBand,etfPriceLimitRegime} from './core.mjs';
import {m25Tabs} from './research.mjs';

export function readIntraday(payload,symbol){
 const today=taipeiDay();
 if(payload?.symbol!==symbol||payload?.date!==today||!Array.isArray(payload?.data)||payload.data.length>2000)throw new Error('分時來源身份或日期不符');
 const seen=new Set();
 const rows=payload.data.map(row=>{
  const time=Date.parse(row.date);
  if(!Number.isFinite(time)||!['open','high','low','close','volume'].every(key=>typeof row[key]==='number'&&Number.isFinite(row[key]))||row.open<=0||row.close<=0||row.low<=0||row.volume<0||row.high<Math.max(row.open,row.close)||row.low>Math.min(row.open,row.close)||seen.has(time))throw new Error('分時 OHLCV 或時間格式不符');
  const date=taipeiDay(new Date(time));
  if(date!==today)throw new Error('行情來源只允許本日分時資料');
  seen.add(time);return {...row,time,day:date};
 }).sort((a,b)=>a.time-b.time);
 return {date:today,rows,days:rows.length?[today]:[]};
}

function exchangeDateTime(now,forUS=false){
 const zone=forUS?'America/New_York':'Asia/Taipei';
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
 return {date:`${parts.year}-${parts.month}-${parts.day}`,minutes:Number(parts.hour)*60+Number(parts.minute)};
}
export function isPreOpenCalendarRefreshWindow(now,forUS=false){
 const {minutes}=exchangeDateTime(now,forUS),open=forUS?570:540;
 return minutes>=open-30&&minutes<open;
}
export function calendarConfirmsMarketOpen(calendar,now,forUS=false){
 const {date}=exchangeDateTime(now,forUS),market=forUS?'us':'tw',today=calendar?.meta?.today?.[market];
 const year=calendar?.meta?.years?.[date.slice(0,4)],holidays=year?.[market];
 return today?.date===date&&today?.is_closed===false&&Array.isArray(holidays)&&!holidays.includes(date);
}
export function hasPreOpenCalendarConfirmation(result,now,forUS=false){
 if(!result||result.error||result.confirmed!==true||result.date!==exchangeDateTime(now,forUS).date||!Number.isFinite(result.checkedAt))return false;
 return isPreOpenCalendarRefreshWindow(new Date(result.checkedAt),forUS)&&calendarConfirmsMarketOpen(result.calendar,now,forUS);
}
export function hasSameDayOpenMarketConfirmation(result,now,forUS=false){
 if(!result||result.error||result.confirmed!==true||result.date!==exchangeDateTime(now,forUS).date||!Number.isFinite(result.checkedAt)||result.checkedAt>now.getTime()+120_000)return false;
 return calendarConfirmsMarketOpen(result.calendar,now,forUS);
}
export function renderValuationEvidenceTabs(symbol,tabs){
 const code=e(symbol),nav=`<div class="valuation-evidence-tabs" role="tablist" aria-label="估值依據分頁">${tabs.map(([key,label],index)=>`<button type="button" role="tab" data-valuation-tab="${e(key)}" id="valuation-tab-${code}-${e(key)}" aria-controls="valuation-panel-${code}-${e(key)}" aria-selected="${index===0}" tabindex="${index===0?0:-1}" class="${index===0?'primary':''}">${e(label)}</button>`).join('')}</div>`;
 const panels=tabs.map(([key,,content],index)=>`<section class="valuation-evidence-panel" role="tabpanel" id="valuation-panel-${code}-${e(key)}" aria-labelledby="valuation-tab-${code}-${e(key)}" data-valuation-panel="${e(key)}"${index===0?'':' hidden'}>${content}</section>`).join('');
 return `<div class="valuation-evidence" data-valuation-evidence="${code}">${nav}${panels}</div>`;
}
export function isTaiwanTradingSession(now,calendar){
 const {date,minutes}=exchangeDateTime(now,false);
 if(!calendarConfirmsMarketOpen(calendar,now,false))return false;
 return minutes>=540&&minutes<=810;
}
export function isTaiwanTradingDateAfterOpen(now,calendar){
 const {minutes}=exchangeDateTime(now,false);
 return calendarConfirmsMarketOpen(calendar,now,false)&&minutes>=540;
}

export function readYahooIntraday(payload,symbol,market,today=taipeiDay()){
 const suffix=market==='TPEX'?'.TWO':'.TW',expected=`${symbol}${suffix}`,result=payload?.chart?.result?.[0];
 if(payload?.chart?.error||result?.meta?.symbol!==expected||!Array.isArray(result?.timestamp))throw new Error('Yahoo 分時證券身份或回應格式不符');
 const quote=result.indicators?.quote?.[0],timestamps=result.timestamp;
 if(!quote||timestamps.length>2000)throw new Error('Yahoo 分時資料筆數或欄位不符');
 const rows=[];
 for(let i=0;i<timestamps.length;i++){
  const time=Number(timestamps[i]);if(!Number.isFinite(time)||time<=0)throw new Error('Yahoo 分時時間戳無效');const date=new Date(time*1000),day=taipeiDay(date),minute=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date);
  if(day!==today||minute<'09:00'||minute>'13:30')continue;
  const row={date:date.toISOString(),open:quote.open?.[i],high:quote.high?.[i],low:quote.low?.[i],close:quote.close?.[i],volume:quote.volume?.[i]};
  if(!['open','high','low','close','volume'].every(key=>typeof row[key]==='number'&&Number.isFinite(row[key]))||row.open<=0||row.high<=0||row.low<=0||row.close<=0||row.volume<0)continue;
  rows.push(row);
 }
 const parsed=readIntraday({symbol,date:today,data:rows},symbol),meta=result.meta??{},marketTime=Number(meta.regularMarketTime),price=Number(meta.regularMarketPrice),prior=Number(meta.chartPreviousClose??meta.previousClose);
 let currentQuote=null;
 if(Number.isFinite(marketTime)&&marketTime>0&&Number.isFinite(price)&&price>0&&Number.isFinite(prior)&&prior>0){
  const quotedAt=new Date(marketTime*1000),age=Date.now()-quotedAt.getTime(),marketDate=taipeiDay(quotedAt),minutes=exchangeDateTime(new Date(),false).minutes;
  if(marketDate===today&&marketTime*1000<=Date.now()+120_000&&(!(minutes>=540&&minutes<=810)||age<=30*60_000)){
   currentQuote={price,change:price-prior,changePercent:(price-prior)/prior*100,date:today,time:new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(quotedAt)};
  }
 }
 return {...parsed,quote:currentQuote};
}

export function readYahooUSMarketQuote(payload,symbol,now=new Date()){
 const result=payload?.chart?.result?.[0],meta=result?.meta;
 if(payload?.chart?.error||meta?.symbol!==symbol)throw new Error('Yahoo 美股證券身份不符');
 const marketTime=Number(meta.regularMarketTime),price=Number(meta.regularMarketPrice),prior=Number(meta.chartPreviousClose??meta.previousClose);
 if(!Number.isFinite(marketTime)||marketTime<=0||!Number.isFinite(price)||price<=0||!Number.isFinite(prior)||prior<=0)throw new Error('Yahoo 美股報價欄位不足');
 const timestamp=marketTime*1000,date=new Date(timestamp),today=exchangeDateTime(now,true).date,marketDate=exchangeDateTime(date,true).date;
 if(marketDate!==today||timestamp>now.getTime()+120_000)throw new Error('Yahoo 美股報價日期不符');
 const minutes=exchangeDateTime(now,true).minutes,inSession=minutes>=570&&minutes<960,age=now.getTime()-timestamp;
 if(inSession&&(age< -120_000||age>30*60_000))throw new Error('Yahoo 美股盤中報價時間過舊');
 const change=price-prior;
 return {symbol,price,change,changePercent:change/prior*100,date:marketDate,time:new Intl.DateTimeFormat('zh-TW',{timeZone:'America/New_York',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(date),source:'Yahoo Finance',isIntraday:inSession};
}

export function readYahooTWIndexQuote(payload,symbol,now=new Date()){
 const expected={'IX0001':'^TWII','IX0043':'^TWOII'}[symbol],meta=payload?.chart?.result?.[0]?.meta;
 if(!expected||payload?.chart?.error||meta?.symbol!==expected)throw new Error('Yahoo 台灣指數身份不符');
 const marketTime=Number(meta.regularMarketTime),price=Number(meta.regularMarketPrice),prior=Number(meta.chartPreviousClose??meta.previousClose);
 if(!Number.isFinite(marketTime)||marketTime<=0||!Number.isFinite(price)||price<=0||!Number.isFinite(prior)||prior<=0)throw new Error('Yahoo 台灣指數報價欄位不足');
 const timestamp=marketTime*1000,date=new Date(timestamp),today=exchangeDateTime(now,false).date,marketDate=exchangeDateTime(date,false).date;
 if(marketDate!==today||timestamp>now.getTime()+120_000)throw new Error('Yahoo 台灣指數報價日期不符');
 const minutes=exchangeDateTime(now,false).minutes,inSession=minutes>=540&&minutes<810,age=now.getTime()-timestamp;
 if(inSession&&(age< -120_000||age>30*60_000))throw new Error('Yahoo 台灣指數盤中報價時間過舊');
 const change=price-prior;
 return {symbol,price,change,changePercent:change/prior*100,date:marketDate,time:new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(date),source:'Yahoo Finance',isIntraday:inSession};
}

export function readYahooMarketSnapshot(payload,symbol,now=new Date()){
 const expectedMarket=['IX0001','IX0043'].includes(symbol)?'tw':'us',forUS=expectedMarket==='us';
 if(payload?.schemaVersion!==1||payload?.source!=='yahoo.chart.1m'||!Array.isArray(payload?.quotes))throw new Error('Yahoo Public_Data 快照格式不符');
 const generated=Date.parse(payload.generatedAt);if(!Number.isFinite(generated)||generated>now.getTime()+60_000)throw new Error('Yahoo Public_Data 快照時間無效');
 const rows=payload.quotes.filter(row=>row?.symbol===symbol);
 if(rows.length!==1)throw new Error('Yahoo Public_Data 快照代號重複或不存在');
 const row=rows[0],today=exchangeDateTime(now,forUS).date;
 if(row.market!==expectedMarket||row.source!=='Yahoo Finance'||row.dataDate!==today)throw new Error('Yahoo Public_Data 快照市場或日期不符');
 const timestamp=Number(row.timestamp)*1000,price=Number(row.price),prior=Number(row.previousClose);
 if(!Number.isFinite(timestamp)||timestamp<=0||timestamp>now.getTime()+120_000||!Number.isFinite(price)||price<=0||!Number.isFinite(prior)||prior<=0)throw new Error('Yahoo Public_Data 報價欄位不足');
 if(timestamp>generated+60_000)throw new Error('Yahoo Public_Data 報價時間晚於快照時間');
 const local=exchangeDateTime(now,forUS),marketTime=exchangeDateTime(new Date(timestamp),forUS);
 if(marketTime.date!==today)throw new Error('Yahoo Public_Data 報價交易日不符');
 const inSession=forUS?local.minutes>=570&&local.minutes<960:local.minutes>=540&&local.minutes<810,age=now.getTime()-timestamp;
 if(inSession&&(age< -120_000||age>30*60_000))throw new Error('Yahoo Public_Data 盤中報價過舊');
 const formatter=new Intl.DateTimeFormat('zh-TW',{timeZone:forUS?'America/New_York':'Asia/Taipei',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
 return {symbol,price,change:price-prior,changePercent:(price-prior)/prior*100,date:today,time:formatter.format(new Date(timestamp)),source:'Yahoo Finance',isIntraday:inSession};
}

export function readFugleIndexMessage(message,symbolsByMarket,now=new Date()){
 const data=message?.data,market=Object.entries(symbolsByMarket??{}).find(([,symbol])=>symbol===data?.symbol)?.[0];
 if(message?.event!=='data'||(message.channel??data?.channel)!=='indices'||data?.type!=='INDEX'||!market||data.exchange!==(market==='TWSE'?'TWSE':'TPEX'))throw new Error('Fugle 指數身份不符');
 const price=Number(data.index),rawTime=Number(data.time),timestamp=rawTime>10_000_000_000_000?rawTime/1_000_000:rawTime>10_000_000_000?rawTime/1_000:rawTime;
 if(!Number.isFinite(price)||price<=0||!Number.isFinite(timestamp)||timestamp<=0)throw new Error('Fugle 指數報價欄位不足');
 const date=new Date(timestamp*1000),today=exchangeDateTime(now,false).date,marketDate=exchangeDateTime(date,false).date,age=now.getTime()-date.getTime();
 if(marketDate!==today||age< -120_000||age>30*60_000)throw new Error('Fugle 指數報價日期或時間不符');
 const symbol=market==='TWSE'?'IX0001':'IX0043';
 const minutes=exchangeDateTime(now,false).minutes;
 return {symbol,price,date:marketDate,time:new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(date),source:'Fugle',isIntraday:minutes>=540&&minutes<810};
}

export function aggregateIntradayRows(rows,minutes=1){
 if(![1,5,15,30,60].includes(minutes))throw new Error('分時 K 線週期不支援');
 if(minutes===1)return rows.map(row=>({...row}));
 const timeParts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 const buckets=new Map();
 for(const row of rows){
  const parts=Object.fromEntries(timeParts.formatToParts(new Date(row.time)).filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));
  const day=`${parts.year}-${parts.month}-${parts.day}`,slot=Math.floor((Number(parts.hour)*60+Number(parts.minute))/minutes),key=`${day}:${slot}`,prior=buckets.get(key);
  if(prior){prior.high=Math.max(prior.high,row.high);prior.low=Math.min(prior.low,row.low);prior.close=row.close;prior.volume+=row.volume;if(!Number.isFinite(prior.volume))throw new Error('分時成交量加總超出有效範圍');}
  else buckets.set(key,{...row,interval:minutes});
 }
 return [...buckets.values()].sort((a,b)=>a.time-b.time);
}

export function reserveRequestWindow(storage,key,now,limit,windowMs){
 try{if(!Number.isFinite(now)||!Number.isInteger(limit)||limit<1||!Number.isFinite(windowMs)||windowMs<=0)return false;const recent=JSON.parse(storage.getItem(key)||'[]');if(!Array.isArray(recent))return false;const active=recent.filter(t=>Number.isFinite(t)&&now-t<windowMs);if(active.length>=limit)return false;active.push(now);storage.setItem(key,JSON.stringify(active));return true;}catch{return false;}
}

export function createServicesModule(ctx){
 let key='',finmindKey='',geminiKey='',fxKey='',feedback='',intradayRange='1d',intradayTimeframe=1,serviceResults={},fugleIndexSocket=null,fugleIndexSymbolsByMarket=null,fugleIndexCatalogPromise=null,fugleIndexAuthenticated=false,fugleIndexAuthPromise=null;const priceBands=new Map(),intradayCache=new Map(),preOpenCalendar=new Map(),preOpenAttempts=new Map(),yahooIndexCache=new Map(),fugleIndexQuotes=new Map();const fugleCallsKey='rebuild.free-tier.fugle.calls.v1',yahooCallsKey='rebuild.free-tier.yahoo.calls.v1',yahooStockEndpoint='https://acer-worker.tail5f9e3f.ts.net/v1/market/yahoo/chart';
 function exchangeDate(now,forUS=false){return exchangeDateTime(now,forUS).date;}
 async function refreshCalendarBeforeOpen(forUS,now=new Date()){
  if(!isPreOpenCalendarRefreshWindow(now,forUS))return;
  const market=forUS?'us':'tw',date=exchangeDate(now,forUS),key=`${market}:${date}`;
  const prior=preOpenCalendar.get(market);if(prior?.date===date&&!prior.error)return;
  const attemptedAt=preOpenAttempts.get(key)||0;if(Date.now()-attemptedAt<300_000)return;
  preOpenAttempts.set(key,Date.now());
  try{localStorage.setItem('rebuild.calendar.preopen.attempts.v1',JSON.stringify([...preOpenAttempts.entries()].slice(-20)));}catch{}
  try{
   const calendar=await ctx.publicData('meta/calendar.json',{reload:true});
   const result={date,calendar,confirmed:calendarConfirmsMarketOpen(calendar,now,forUS),checkedAt:Date.now()};preOpenCalendar.set(market,result);
   try{localStorage.setItem(`rebuild.calendar.preopen.result.v1.${market}`,JSON.stringify(result));}catch{}
  }catch(error){preOpenCalendar.set(market,{date,calendar:null,confirmed:false,checkedAt:Date.now(),error:error.message});}
 }
 async function confirmMarketForQuotes(forUS,now=new Date()){
  const market=forUS?'us':'tw',date=exchangeDate(now,forUS),existing=preOpenCalendar.get(market);
  if(hasSameDayOpenMarketConfirmation(existing,now,forUS))return existing.calendar;
  if(existing&&!existing.error&&existing.date===date&&Number.isFinite(existing.checkedAt)&&existing.checkedAt<=now.getTime()+120_000&&!calendarConfirmsMarketOpen(existing.calendar,now,forUS))return null;
  const attemptKey=`rebuild.calendar.quote-attempts.v1.${market}.${date}`;
  if(!reserveRequestWindow(localStorage,attemptKey,Date.now(),1,300_000))return null;
  try{
   const calendar=await ctx.publicData('meta/calendar.json',{reload:true});
   const result={date,calendar,confirmed:calendarConfirmsMarketOpen(calendar,now,forUS),checkedAt:Date.now()};
   preOpenCalendar.set(market,result);
   try{localStorage.setItem(`rebuild.calendar.preopen.result.v1.${market}`,JSON.stringify(result));}catch{}
   return result.confirmed?calendar:null;
  }catch(error){preOpenCalendar.set(market,{date,calendar:null,confirmed:false,checkedAt:Date.now(),error:error.message});return null;}
 }
 try{for(const [key,stamp] of JSON.parse(localStorage.getItem('rebuild.calendar.preopen.attempts.v1')||'[]'))if(typeof key==='string'&&Number.isFinite(stamp))preOpenAttempts.set(key,stamp);for(const market of ['tw','us']){const item=JSON.parse(localStorage.getItem(`rebuild.calendar.preopen.result.v1.${market}`)||'null');if(item&&item.date===exchangeDate(new Date(),market==='us'))preOpenCalendar.set(market,item);}}catch{}
 const checkPreOpenCalendars=()=>Promise.all([refreshCalendarBeforeOpen(false),refreshCalendarBeforeOpen(true)]);
 void checkPreOpenCalendars();window.setInterval?.(()=>{void checkPreOpenCalendars();},30_000);globalThis.document?.addEventListener('visibilitychange',()=>{if(globalThis.document.visibilityState==='visible')void checkPreOpenCalendars();});
 function reserveFugleRequest(){return reserveRequestWindow(localStorage,fugleCallsKey,Date.now(),20,60_000);}
 async function fugleIndexCatalog(){
  if(fugleIndexSymbolsByMarket)return fugleIndexSymbolsByMarket;
  if(fugleIndexCatalogPromise)return fugleIndexCatalogPromise;
  fugleIndexCatalogPromise=(async()=>{
   if(!key||!reserveFugleRequest())throw new Error('Fugle 免費方案保護已啟動');
   const response=await fetch('https://api.fugle.tw/marketdata/v1.0/stock/intraday/tickers?type=INDEX',{headers:{'X-API-KEY':key},cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(10000)});
   if(!response.ok)throw new Error(`Fugle 指數名錄回應 ${response.status}`);
   const payload=await response.json();if(payload.type!=='INDEX'||!Array.isArray(payload.data))throw new Error('Fugle 指數名錄格式不符');
   const mapping={};for(const item of payload.data){if(typeof item.symbol!=='string'||!item.symbol)continue;const name=String(item.name??'');if(name.includes('發行量加權'))mapping.TWSE=item.symbol;else if(name==='櫃買指數'||name.includes('櫃檯買賣指數'))mapping.TPEX=item.symbol;}
   if(!mapping.TWSE||!mapping.TPEX)throw new Error('Fugle 指數名錄未提供加權及 OTC 對應');
   fugleIndexSymbolsByMarket=mapping;return mapping;
  })().finally(()=>{fugleIndexCatalogPromise=null;});
  return fugleIndexCatalogPromise;
 }
 async function connectFugleIndexSocket(){
  if(fugleIndexSocket?.readyState===WebSocket.OPEN&&fugleIndexAuthenticated)return true;
  if(fugleIndexAuthPromise)return fugleIndexAuthPromise;
  const mapping=await fugleIndexCatalog();
  fugleIndexAuthPromise=new Promise(resolve=>{
   let settled=false;const finish=value=>{if(settled)return;settled=true;clearTimeout(timer);resolve(value);};
   const timer=setTimeout(()=>{finish(false);try{fugleIndexSocket?.close();}catch{}},5000);
   try{
    const socket=new WebSocket('wss://api.fugle.tw/marketdata/v1.0/stock/streaming');fugleIndexSocket=socket;fugleIndexAuthenticated=false;
    socket.onopen=()=>socket.send(JSON.stringify({event:'auth',data:{apikey:key}}));
    socket.onmessage=event=>{let message;try{message=JSON.parse(event.data);}catch{return;}
     if(message.event==='authenticated'){
      fugleIndexAuthenticated=true;socket.send(JSON.stringify({event:'subscribe',data:{channel:'indices',symbols:Object.values(mapping)}}));finish(true);return;
     }
     if(message.event==='error'){finish(false);return;}
     try{const quote=readFugleIndexMessage(message,mapping);fugleIndexQuotes.set(quote.symbol,{...quote,at:Date.now()});}catch{}
    };
    socket.onerror=()=>finish(false);socket.onclose=()=>{fugleIndexAuthenticated=false;if(fugleIndexSocket===socket)fugleIndexSocket=null;};
   }catch{finish(false);}
  }).finally(()=>{fugleIndexAuthPromise=null;});
  return fugleIndexAuthPromise;
 }
 async function fetchFugleIndexQuotes(now){
  try{
   const mapping=await fugleIndexCatalog(),connected=await connectFugleIndexSocket();if(!connected)return {};
   const fresh=()=>['IX0001','IX0043'].every(symbol=>{const quote=fugleIndexQuotes.get(symbol);return quote&&quote.date===exchangeDate(now,false).date&&Date.now()-quote.at<30*60_000;});
   if(!fresh())await new Promise(resolve=>{const deadline=Date.now()+3500,timer=setInterval(()=>{if(fresh()||Date.now()>=deadline){clearInterval(timer);resolve();}},100);});
   const output={};for(const [symbol,quote] of fugleIndexQuotes){if(quote.date===exchangeDate(now,false).date&&Date.now()-quote.at<30*60_000)output[symbol]=quote;}
   return output;
  }catch{return {};}
 }
 async function yahooSnapshotQuotes(symbols,market,now){
  const output={};let snapshot;
  try{snapshot=await ctx.publicData('rebuild/index-intraday.json');}catch{return output;}
  for(const symbol of symbols){
   try{const quote=readYahooMarketSnapshot(snapshot,symbol,now);if((market==='tw'&&['IX0001','IX0043'].includes(symbol))||(market==='us'&&!['IX0001','IX0043'].includes(symbol)))output[symbol]=quote;}catch{}
  }
  return output;
 }
 async function marketIndexQuotes(state){
  const now=new Date(),today=exchangeDateTime(now,false).date,minutes=exchangeDateTime(now,false).minutes;
  if(minutes<540)return {};
  const symbols=['IX0001','IX0043'],missing=symbols.filter(symbol=>state.indices?.find(row=>row.symbol===symbol)?.asOf!==today);if(!missing.length)return {};
  const calendar=await confirmMarketForQuotes(false,now);
  if(!calendar)return {};
  const output={};
  if(key&&isTaiwanTradingSession(now,calendar))Object.assign(output,await fetchFugleIndexQuotes(now));
  const snapshot=await yahooSnapshotQuotes(missing,'tw',now);
  for(const symbol of missing)if(!output[symbol]&&snapshot[symbol])output[symbol]=snapshot[symbol];
  return output;
 }
 async function marketQuotes(state){
  const now=new Date(),today=exchangeDateTime(now,true).date,minutes=exchangeDateTime(now,true).minutes;
  if(minutes<570)return {};
  const symbols=['^DJI','^IXIC','^GSPC','^SOX','TSM'],missing=symbols.filter(symbol=>state.indices?.find(row=>row.symbol===symbol)?.asOf!==today);
  if(!missing.length)return {};
  const calendar=await confirmMarketForQuotes(true,now);
  if(!calendar)return {};
  return yahooSnapshotQuotes(missing,'us',now);
 }
 function stampServiceResult(message){return `${message}・${new Date().toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false})}`;}
 window.addEventListener('pagehide',()=>{key='';priceBands.clear();intradayCache.clear();try{fugleIndexSocket?.close();}catch{}fugleIndexSocket=null;fugleIndexAuthenticated=false;});
 const time=value=>new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value));
 function page(){
  const secretField=(label,name,value)=>`<div class="service-secret-field"><label>${e(label)}<input type="password" name="${name}" value="${e(value)}" form="rebuild-service-form" autocomplete="off" spellcheck="false" aria-label="${e(label)}"></label><button type="button" data-service-reveal="${name}" aria-label="顯示${e(label)}">顯示</button></div>`;
  const settingField=(label,value,id)=>`<div class="service-setting-field"><label for="${id}">${e(label)}</label><input id="${id}" type="text" value="${e(value)}" readonly aria-readonly="true"></div>`;
  const lastTest=provider=>{
   const result=serviceResults[provider]||'',success=result.startsWith('連線成功'),failure=result.startsWith('連線失敗'),tested=success||failure;
   const title=tested?(success?'連線成功':'連線失敗'):provider==='finmind'?'依規則僅使用 Public_Data':'尚未測試';
   const stamp=tested?result.split('・').at(-1):'';
   return `<div class="service-last-test" aria-label="最後測試"><span>最後測試</span><strong class="${success?'success':failure?'failure':'muted'}">${e(title)}</strong>${tested?`<time>${e(stamp)}</time>`:''}</div>`;
  };
  return ctx.card('公開資料服務',`<p>Public_Data 公開資料不需要金鑰。</p><p class="muted">服務金鑰只保留在本分頁記憶體，不進備份；關閉或重載頁面後需重新輸入。連線只會在您按下單項測試時發出，不會自動呼叫。</p>`)
   +ctx.card('Fugle・即時行情',`${secretField('API Key','fugle',key)}${settingField('基礎網址','https://api.fugle.tw','fugle-base-url')}${lastTest('fugle')}<div class="toolbar"><button type="button" data-service-test="fugle">測試連線</button><button type="button" data-service-save="fugle">儲存設定</button><button type="button" data-service-clear="fugle">清除</button></div><p role="status">${e(serviceResults.fugle||feedback||(key?'本分頁已設定・尚未測試':'尚未設定金鑰'))}</p><p class="muted">探測台積電 2330 Ticker，使用全瀏覽器共用 20 次／60 秒 Fugle 保護。</p>`)
   +ctx.card('FinMind・資料服務',`${secretField('API Token','finmind',finmindKey)}${lastTest('finmind')}<div class="toolbar"><button type="button" disabled aria-describedby="finmind-test-policy" title="新版財務資料只使用 Public_Data，不直接呼叫 FinMind。">測試連線</button><button type="button" data-service-save="finmind">儲存設定</button><button type="button" data-service-clear="finmind">清除</button></div><p role="status">${e(serviceResults.finmind||(finmindKey?'本分頁已設定':'尚未設定 Token'))}</p><p id="finmind-test-policy" class="muted">新版行情與財務資料只讀 Public_Data；FinMind 連線測試停用，避免繞過 canonical 資料來源。</p>`)
   +ctx.card('Gemini・生成式 AI',`${secretField('API Key','gemini',geminiKey)}${settingField('模型版本','gemini-2.5-flash','gemini-model-version')}${lastTest('gemini')}<div class="toolbar"><button type="button" data-service-test="gemini">測試連線</button><button type="button" data-service-save="gemini">儲存設定</button><button type="button" data-service-clear="gemini">清除</button></div><p role="status">${e(serviceResults.gemini||(geminiKey?'本分頁已設定・尚未測試':'尚未設定金鑰'))}</p><p class="muted">僅 GET 模型資訊，不生成內容；每瀏覽器至少間隔 60 秒，且 24 小時最多 10 次。儲存空間不可用即停止請求。</p>`)
   +ctx.card('ExchangeRate-API・匯率',`${secretField('API Key','fx',fxKey)}${lastTest('fx')}<div class="toolbar"><button type="button" data-service-test="fx">測試連線</button><button type="button" data-service-save="fx">儲存設定</button><button type="button" data-service-clear="fx">清除</button></div><p role="status">${e(serviceResults.fx||(fxKey?'本分頁已設定・尚未測試':'尚未設定金鑰'))}</p><p class="muted">瀏覽器最多每 24 小時測試一次，失敗也計入冷卻；不會把測試結果寫入市場資料。</p>`)
   +`<form id="rebuild-service-form" class="stack"><button class="primary">套用輸入金鑰至本分頁</button></form>`;
 }
 async function intraday(symbol,row){
  const identity=`${row.name} ${symbol}`,today=taipeiDay();
  if(!resolveListingStatus(symbol,today,ctx.state.listing).eligible)return ctx.status('目前市場資料不可用','上市資格尚未確認。');
  if(String(row.asOf??'').slice(0,10)===today)return ctx.status('今日 Public_Data 行情已發布','依資料來源規則使用 Public_Data；目前沒有 canonical 個股歷史分鐘序列，不以外部即時來源覆蓋。');
  try{
   const now=new Date(),calendar=await confirmMarketForQuotes(false,now);
   if(!calendar||!isTaiwanTradingDateAfterOpen(now,calendar))return ctx.status('目前市場行情不可用','Public_Data calendar.json 尚未確認台股今日開市，或尚未到開盤時間；不呼叫行情服務。');
   const cached=intradayCache.get(symbol);let source=cached?.source,provider=cached?.provider;
   if(!source||Date.now()-cached.at>=60_000){
    if(key){
     if(!reserveFugleRequest())return ctx.status('Fugle 免費方案保護已啟動','本瀏覽器最近 60 秒已達 20 次 REST 請求；稍後重試。');
     const response=await fetch(`https://api.fugle.tw/marketdata/v1.0/stock/intraday/candles/${encodeURIComponent(symbol)}`,{headers:{'X-API-KEY':key},cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(12000)});
     if(!response.ok)throw new Error(response.status===401||response.status===403?'金鑰或行情方案權限不足。':response.status===429?'行情服務請求過多，請稍後重試。':`行情服務暫不可用（${response.status}）。`);
     const payload=await response.json();source=readIntraday({symbol,date:today,data:payload.data},symbol);provider='Fugle';
    }else{
     if(!reserveRequestWindow(localStorage,yahooCallsKey,Date.now(),10,60_000)||!reserveRequestWindow(localStorage,`${yahooCallsKey}.${symbol}`,Date.now(),1,60_000))return ctx.status('Yahoo 免費來源保護已啟動','每支證券每 60 秒最多 1 次，所有 Yahoo 分時合計每 60 秒最多 10 次。');
     const listing=ctx.state.listing.stocks[symbol],response=await fetch(yahooStockEndpoint+'?symbol='+encodeURIComponent(symbol),{headers:{Accept:'application/json'},mode:'cors',cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(12000)});
     if(!response.ok){let detail='';try{detail=(await response.json()).error||'';}catch{}const reasons={rate_limited:'N100 Yahoo 免費來源保護啟動：全站每分鐘最多 10 次、每支股票每分鐘最多 1 次。',public_data_available:'Public_Data 已發布今日個股資料，請重新載入以使用 canonical 資料。',calendar_unconfirmed:'Public_Data calendar.json 尚未確認台股今日開市。',not_listed:'股票清單未確認此代號為目前上市／上櫃證券。',market_not_open:'尚未到台股開盤時間。'};throw new Error(reasons[detail]||'N100 Yahoo 行情端點回應 '+response.status+'。');}
     source=readYahooIntraday(await response.json(),symbol,listing.market,today);provider='Yahoo Finance';
    }
    intradayCache.set(symbol,{source,provider,at:Date.now()});
   }
   if(!resolveListingStatus(symbol,today,ctx.state.listing).eligible)return ctx.status('上市資格已過期','請同步今日上市資料後重試。');
   if(!source.rows.length)return ctx.status('今日尚無分時成交',`${provider} 未提供本日分鐘 K 線；不以日 K 代替，也不補抓歷史分鐘資料。${provider==='Yahoo Finance'?'Yahoo 可能延遲 15 分鐘，非即時。':''}`);
   const days=source.days,selectedDays=intradayRange==='1d'?days.slice(-1):intradayRange==='5d'?days.slice(-5):days,selected=new Set(selectedDays),rawRows=source.rows.filter(item=>selected.has(item.day)),rows=aggregateIntradayRows(rawRows,intradayTimeframe);
   const lo=Math.min(...rows.map(x=>x.low)),hi=Math.max(...rows.map(x=>x.high)),span=hi-lo||Math.max(Math.abs(hi)*.001,.01),maxVolume=Math.max(...rows.map(x=>x.volume),1);
   const x=index=>40+index*640/Math.max(1,rows.length-1),y=value=>25+(hi-value)/span*185,baseline=215;
   const points=rows.map((row,index)=>`${x(index)},${y(row.close)}`).join(' '),area=`${points} ${x(rows.length-1)},${baseline} ${x(0)},${baseline}`;
   const rangeMove=rows.at(-1).close-rows[0].open,sourceSameDay=String(row.asOf??'').slice(0,10)===rows.at(-1).day,movement=intradayRange==='1d'&&sourceSameDay&&Number.isFinite(row.changePercent)?row.changePercent:rangeMove,color=movement>0?'var(--up)':movement<0?'var(--down)':'var(--muted)';
   const bars=rows.map((item,index)=>{const barColor=item.close>item.open?'var(--up)':item.close<item.open?'var(--down)':'var(--muted)';return`<rect x="${x(index)-1}" y="${290-item.volume/maxVolume*55}" width="2" height="${item.volume/maxVolume*55}" fill="${barColor}"><title>${e(identity)} ${time(item.time)}・成交量 ${n(item.volume,0)}（${provider} 原始單位）</title></rect>`;}).join('');
   const rangeLabel='本日';
   const controls=[['1d','當日',days.length>0],['5d','5日',false],['1m','1月',false],['3m','3月',false],['6m','6月',false],['1y','1年',false],['5y','5年',false]].map(([key,label,enabled])=>`<button type="button" data-intraday-range="${key}" aria-pressed="${intradayRange===key}" ${enabled?'':'disabled'} ${intradayRange===key?'class="primary"':''} ${enabled?'':`title="Public_Data 尚未提供歷史分鐘資料"`}>${label}</button>`).join(''),timeframes=[1,5,15,30,60].map(minutes=>`<button type="button" data-intraday-timeframe="${minutes}" aria-pressed="${intradayTimeframe===minutes}" ${intradayTimeframe===minutes?'class="primary"':''}>${minutes} 分</button>`).join('');
   const dateLabel=value=>new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value));
   const graph=`<svg class="chart" viewBox="0 0 720 330" role="img" aria-label="${e(identity)} ${e(source.date??'日期不足')} ${rangeLabel} 原始分時價格與成交量"><text x="40" y="18">${n(hi)}</text><text x="40" y="230">${n(lo)}</text><polygon points="${area}" fill="${color}" fill-opacity=".22"/><polyline points="${points}" fill="none" stroke="${color}" stroke-width="2"/>${bars}<text x="40" y="318">${dateLabel(rows[0].time)}</text><text x="590" y="318">${dateLabel(rows.at(-1).time)}</text></svg>`;
   const details=rows.slice(-20).map(item=>`<p>${e(identity)} ${dateLabel(item.time)}<br>開 ${n(item.open)}・高 ${n(item.high)}・低 ${n(item.low)}・收 ${n(item.close)}・量 ${n(item.volume,0)}（${provider} 原始單位）</p>`).join('');
   const currentQuote=provider==='Yahoo Finance'&&source.quote?'<p class="source" data-yahoo-quote="'+e(symbol)+'">Yahoo 最新報價 '+n(source.quote.price)+'・漲跌 '+n(source.quote.change)+'（'+n(source.quote.changePercent)+'%）・台灣當地時間 '+e(source.quote.date)+' '+e(source.quote.time)+'・可能延遲 15 分鐘，非即時</p>':'';
   return ctx.card(`${identity}・分時行情`,`<div class="toolbar intraday-periods" role="group" aria-label="分時期間">${controls}</div><div class="toolbar intraday-periods" role="group" aria-label="分時 K 線週期">${timeframes}</div>${currentQuote}<div class="metric-grid">${ctx.metric('最高',n(Math.max(...rows.map(item=>item.high))))}${ctx.metric('最低',n(Math.min(...rows.map(item=>item.low))))}${ctx.metric('開盤',n(rows[0].open))}${ctx.metric('收盤',n(rows.at(-1).close))}</div><p class="source muted">${provider} 本日 1 分原始 OHLCV${provider==='Yahoo Finance'?'・可能延遲 15 分鐘，非即時':''}${intradayTimeframe>1?`・按台北交易時段聚合為 ${intradayTimeframe} 分 K`:''}・原始價格・${e(rows[0].day)} 至 ${e(rows.at(-1).day)}・最近一次來源日期 ${e(source.date??'日期不足')}</p>${graph}<p class="muted">成交量使用 ${provider} 原始單位（依商品類型）。歷史分鐘區間僅使用 Public_Data；尚未提供時保持停用；不同週期均由同一份 1 分 OHLCV 聚合，不補造缺失分鐘。</p><button data-action="reload">重新載入分時資料</button>`)+ctx.card('分時 K 線資料',`<details><summary>檢視最近 ${rows.length} 根 ${intradayTimeframe} 分 K</summary>${details}</details>`);
  }catch(error){const message=error instanceof TypeError?'Yahoo 行情連線失敗；請確認 N100 唯讀端點與網路。':error.name==='TimeoutError'?'行情服務連線逾時。':error.message;return ctx.status('分時行情載入失敗',message,'↗',true)+ctx.card('',ctx.link('services'));}
 }
 async function provisionalCandle(symbol,row){
  if(String(row.asOf??'').slice(0,10)===taipeiDay())return null;
  await intraday(symbol,row);
  const cached=intradayCache.get(symbol),rows=cached?.source?.rows;
  if(!cached||!Array.isArray(rows)||!rows.length)return null;
  const first=rows[0],last=rows.at(-1),high=Math.max(...rows.map(item=>item.high)),low=Math.min(...rows.map(item=>item.low)),volume=rows.reduce((sum,item)=>sum+item.volume,0);
  if(![first.open,last.close,high,low,volume].every(Number.isFinite)||volume<0)return null;
  return {date:first.day,time:Math.floor(first.time/1000),open:first.open,high,low,close:last.close,volume,provider:cached.provider};
 }
 async function priceBand(symbol,row){
  if(!key||!resolveListingStatus(symbol,taipeiDay(),ctx.state.listing).eligible)return null;
  const cached=priceBands.get(symbol);if(cached&&Date.now()-cached.at<(cached.value?300000:15000)){const b=cached.value;if(!b||String(row.asOf??'').slice(0,10)!==b.date||!Number.isFinite(row.price)||row.price<=0)return null;return b.unlimited?{valid:true,unlimited:true,unlimitedKind:b.unlimitedKind||'ipo',label:null}:{valid:true,label:Math.abs(row.price-b.up)<1e-6?'漲停':Math.abs(row.price-b.down)<1e-6?'跌停':null};}
  priceBands.set(symbol,{at:Date.now(),value:null});
  if(!reserveFugleRequest())return null;
  try{
   const response=await fetch(`https://api.fugle.tw/marketdata/v1.0/stock/intraday/ticker/${encodeURIComponent(symbol)}`,{headers:{'X-API-KEY':key},cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(4000)});
   if(!response.ok)throw Error(`行情來源回應 ${response.status}`);
   const source=await response.json(),date=String(source.date??'').slice(0,10),today=taipeiDay();
   const ref=source.referencePrice,up=source.limitUpPrice,down=source.limitDownPrice;
   const current=source.symbol===symbol&&date===today&&String(source.securityStatus??'').toUpperCase()==='NORMAL'&&source.isDisposition!==true&&String(row.asOf??'').slice(0,10)===date&&Number.isFinite(row.price)&&row.price>0&&Number.isFinite(ref)&&ref>0;
   if(!current){priceBands.set(symbol,{at:Date.now(),value:null});return null;}
   if(Number.isFinite(up)&&up>ref&&Number.isFinite(down)&&down>0&&down<ref){const value={date,up,down};priceBands.set(symbol,{at:Date.now(),value});return {valid:true,label:Math.abs(row.price-up)<1e-6?'漲停':Math.abs(row.price-down)<1e-6?'跌停':null};}
   if(source.isDisposition!==false){priceBands.set(symbol,{at:Date.now(),value:null});return null;}
   const listing=ctx.state.listing?.stocks?.[symbol],listingDate=String(listing?.listingDate??'').replaceAll('/','-').slice(0,10);
   if(!listing||!['TWSE','TPEX'].includes(listing.market)||!listingDate){priceBands.set(symbol,{at:Date.now(),value:null});return null;}
   let domesticETFMultiplier=null,regime='UNKNOWN';
   if(listing.securityType==='fund'){
    const facts=await ctx.publicData('rebuild/etf-facts.json'),fund=facts?.funds?.[symbol];
    if(facts?.schemaVersion!==1||facts.cutoff!==today||facts.dateSemantics!=='asOf_is_source_fact_date_generatedAt_is_collection_time'||!fund||fund.symbol!==symbol||fund.market!==listing.market||String(fund.listingDate??'').replaceAll('/','-').slice(0,10)!==listingDate||!/^\d{4}-\d{2}-\d{2}$/.test(fund.asOf)||fund.asOf>today){priceBands.set(symbol,{at:Date.now(),value:null});return null;}
    const officialRegime=etfPriceLimitRegime(fund);regime=officialRegime.regime;
    if(regime==='NO_LIMIT'){const value={date,unlimited:true,unlimitedKind:'etf'};priceBands.set(symbol,{at:Date.now(),value});return {valid:true,unlimited:true,unlimitedKind:'etf',label:null};}
    if(!['DOMESTIC_ETF_10','DOMESTIC_LEVERAGED'].includes(regime)||!Number.isInteger(officialRegime.multiplier)){priceBands.set(symbol,{at:Date.now(),value:null});return null;}
    domesticETFMultiplier=officialRegime.multiplier;
   }else if(listing.securityType==='equity'&&listing.cfi==='ESVUFR'){regime='STANDARD_EQUITY_10';}
   else{priceBands.set(symbol,{at:Date.now(),value:null});return null;}
   const payload=await ctx.publicData('rebuild/charts/'+encodeURIComponent(symbol)+'.json'),bars=readChart(payload,symbol);
   const dates=[...new Set(bars.map(x=>taipeiDay(new Date(x.time*1000))).filter(x=>x>=listingDate&&x<=date))];
   if(!dates.length||dates.at(-1)!==date){priceBands.set(symbol,{at:Date.now(),value:null});return null;}
   // Daily bars cannot prove intervening open days. Keep IPO and recent listings fail-closed.
   if(domesticETFMultiplier===null&&date===listingDate&&dates.length===1){const value={date,unlimited:true,unlimitedKind:'ipo'};priceBands.set(symbol,{at:Date.now(),value});return {valid:true,unlimited:true,unlimitedKind:'ipo',label:null};}
   if(dates.length<6){priceBands.set(symbol,{at:Date.now(),value:null});return null;}
   const band=calculatePriceBand({referencePrice:ref,securityType:listing.securityType,market:listing.market,regime,multiplier:domesticETFMultiplier??1});
   const value=band?{date,up:band.limitUp,down:band.limitDown}:null;
   priceBands.set(symbol,{at:Date.now(),value});return value?{valid:true,label:Math.abs(row.price-value.up)<1e-6?'漲停':Math.abs(row.price-value.down)<1e-6?'跌停':null}:null;
  }catch{return null;}
 }
 function listen(app){
  app.addEventListener('submit',async event=>{if(event.target.id!=='rebuild-service-form')return;event.preventDefault();const form=event.target;const nextKey=form.elements.fugle?.value.trim()||'',nextFinMind=form.elements.finmind?.value.trim()||'',nextGemini=form.elements.gemini?.value.trim()||'',nextFX=form.elements.fx?.value.trim()||'';if(nextKey){key=nextKey;intradayCache.clear();priceBands.clear();serviceResults.fugle='金鑰已更新，尚未重新測試。';}if(nextFinMind){finmindKey=nextFinMind;serviceResults.finmind='Token 已更新至本分頁。';}if(nextGemini){geminiKey=nextGemini;serviceResults.gemini='金鑰已更新，尚未重新測試。';}if(nextFX){fxKey=nextFX;serviceResults.fx='金鑰已更新，尚未重新測試。';}for(const input of app.querySelectorAll('[name=\"fugle\"],[name=\"finmind\"],[name=\"gemini\"],[name=\"fx\"]')){const value=input.name==='fugle'?key:input.name==='finmind'?finmindKey:input.name==='gemini'?geminiKey:fxKey;input.value=value;input.type='password';const reveal=app.querySelector('[data-service-reveal=\"'+input.name+'\"]');if(reveal){reveal.textContent='顯示';reveal.setAttribute('aria-label','顯示'+(input.getAttribute('aria-label')||'金鑰'));}};priceBands.clear();feedback='輸入金鑰已套用至本分頁記憶體。';await ctx.refresh();});
  app.addEventListener('click',async event=>{const timeframe=event.target.closest('[data-intraday-timeframe]');if(timeframe){const minutes=Number(timeframe.dataset.intradayTimeframe);if([1,5,15,30,60].includes(minutes)){intradayTimeframe=minutes;await ctx.refresh();}return;}const range=event.target.closest('[data-intraday-range]');if(range&&!range.disabled){intradayRange=range.dataset.intradayRange;await ctx.refresh();return;}const reveal=event.target.closest('[data-service-reveal]');if(reveal){const input=app.querySelector('[name="'+reveal.dataset.serviceReveal+'"]');if(input){input.type=input.type==='password'?'text':'password';const visible=input.type==='text';reveal.textContent=visible?'隱藏':'顯示';reveal.setAttribute('aria-label',(visible?'隱藏':'顯示')+(input.getAttribute('aria-label')||'金鑰'));}return;}const save=event.target.closest('[data-service-save]');if(save){const provider=save.dataset.serviceSave,field=provider==='fugle'?'fugle':provider==='finmind'?'finmind':provider==='gemini'?'gemini':'fx',input=app.querySelector('[name="'+field+'"]'),candidate=input?.value.trim()||'';if(!candidate){serviceResults[provider]='請先輸入金鑰，再儲存此服務。';await ctx.refresh();return;}if(provider==='fugle'){key=candidate;intradayCache.clear();priceBands.clear();serviceResults.fugle='金鑰已儲存於本分頁，尚未測試。';}else if(provider==='finmind'){finmindKey=candidate;serviceResults.finmind='Token 已保存於本分頁。';}else if(provider==='gemini'){geminiKey=candidate;serviceResults.gemini='金鑰已儲存於本分頁，尚未測試。';}else{fxKey=candidate;serviceResults.fx='金鑰已儲存於本分頁，尚未測試。';}if(input){input.value=candidate;input.type='password';const reveal=app.querySelector('[data-service-reveal=\"'+provider+'\"]');if(reveal){reveal.textContent='顯示';reveal.setAttribute('aria-label','顯示'+(input.getAttribute('aria-label')||'金鑰'));}}feedback='此服務金鑰已套用至本分頁記憶體。';await ctx.refresh();return;}const test=event.target.closest('[data-service-test]');if(test){const provider=test.dataset.serviceTest,form=app.querySelector('#rebuild-service-form');const field=provider==='fugle'?'fugle':provider==='gemini'?'gemini':'fx';const input=app.querySelector(`[name=\"${field}\"]`),candidate=input?.value.trim()|| (provider==='fugle'?key:provider==='gemini'?geminiKey:fxKey);test.disabled=true;serviceResults[provider]='測試中…';await ctx.refresh();try{if(!candidate)throw new Error('請先輸入金鑰並套用至本分頁。');if(provider==='fugle'){if(!resolveListingStatus('2330',taipeiDay(),ctx.state.listing).eligible)throw new Error('上市資格來源尚未確認台積電 2330；目前不呼叫 Fugle。');if(!reserveFugleRequest())throw new Error('已達 Fugle 20 次／60 秒保護上限。');const response=await fetch('https://api.fugle.tw/marketdata/v1.0/stock/intraday/ticker/2330',{headers:{'X-API-KEY':candidate},cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error(`Fugle 回應 ${response.status}`);const result=await response.json();if(result.symbol!=='2330')throw new Error('回應證券身份不符。');if(input?.value){key=candidate;intradayCache.clear();priceBands.clear();}serviceResults.fugle=stampServiceResult(`連線成功・台積電 2330・${result.date||'日期不足'}`);}else if(provider==='gemini'){if(!reserveRequestWindow(localStorage,'rebuild.free-tier.gemini.minute.v1',Date.now(),1,60000)||!reserveRequestWindow(localStorage,'rebuild.free-tier.gemini.day.v1',Date.now(),10,86400000))throw new Error('Gemini 本機保護啟動：至少 60 秒間隔，24 小時最多 10 次。');const response=await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash',{headers:{'x-goog-api-key':candidate},cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error(`Gemini 回應 ${response.status}`);if(input?.value)geminiKey=candidate;serviceResults.gemini=stampServiceResult('連線成功・模型資訊可讀（未生成內容）');}else{if(!reserveRequestWindow(localStorage,'rebuild.free-tier.fx.calls.v1',Date.now(),1,86400000))throw new Error('匯率 API 本機保護啟動：24 小時最多一次，失敗亦計入。');const response=await fetch(`https://v6.exchangerate-api.com/v6/${encodeURIComponent(candidate)}/latest/TWD`,{cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error(`匯率服務回應 ${response.status}`);const result=await response.json();if(result.result!=='success'||!Number.isFinite(result.conversion_rates?.USD))throw new Error('匯率回應缺少有效 USD 匯率。');if(input?.value)fxKey=candidate;serviceResults.fx=stampServiceResult(`連線成功・1 TWD = ${result.conversion_rates.USD} USD`);} }catch(error){serviceResults[provider]=stampServiceResult(error instanceof TypeError?'瀏覽器無法連線或服務不允許跨來源存取。':error.message);}finally{test.disabled=false;await ctx.refresh();}return;}const clear=event.target.closest('[data-service-clear]');if(!clear)return;const provider=clear.dataset.serviceClear;if(provider==='fugle'){key='';intradayCache.clear();}if(provider==='finmind')finmindKey='';if(provider==='gemini')geminiKey='';if(provider==='fx')fxKey='';if(provider)serviceResults[provider]='已清除此分頁金鑰。';priceBands.clear();feedback='本分頁金鑰已清除。';await ctx.refresh();});
 }
 return {page:()=>m25Tabs('services')+page(),intraday,provisionalCandle,priceBand,marketQuotes,marketIndexQuotes,listen};
}
