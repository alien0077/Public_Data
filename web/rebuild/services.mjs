import {escapeHTML as e,number as n,resolveListingStatus,taipeiDay,readChart,calculatePriceBand,etfPriceLimitRegime} from './core.mjs';

export function readIntraday(payload,symbol){
 if(payload?.symbol!==symbol||!/^\d{4}-\d{2}-\d{2}$/.test(payload.date??'')||payload.date>taipeiDay()||!Array.isArray(payload.data))throw new Error('分時來源身份或日期不符');
 const seen=new Set();
 const rows=payload.data.map(row=>{
  const time=Date.parse(row.date);
  if(!Number.isFinite(time)||!['open','high','low','close','volume'].every(key=>typeof row[key]==='number'&&Number.isFinite(row[key]))||row.open<=0||row.close<=0||row.low<=0||row.volume<0||row.high<Math.max(row.open,row.close)||row.low>Math.min(row.open,row.close)||seen.has(time))throw new Error('分時 OHLCV 或時間格式不符');
  const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(time));
  if(day!==payload.date)throw new Error('分時紀錄跨越來源交易日');
  seen.add(time);return {...row,time};
 }).sort((a,b)=>a.time-b.time);
 return {date:payload.date,rows};
}

export function createServicesModule(ctx){
 let key='',feedback='';const priceBands=new Map();
 window.addEventListener('pagehide',()=>{key='';priceBands.clear();});
 const time=value=>new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value));
 function page(){return ctx.card('公開資料服務',`<p>Public_Data 公開資料不需要金鑰。</p><p class="muted">Web 分時行情與當日個股價格帶使用 Fugle 個人金鑰；只保留在本分頁記憶體，重載或關閉後需重新設定，備份不含金鑰。價格帶需同日行情、NORMAL 商品狀態及完整有效上下限。</p>`)+ctx.card('分時行情設定',`<form id="rebuild-service-form" class="stack"><label>Fugle API Key<input type="password" name="fugle" autocomplete="off" spellcheck="false" required aria-label="Fugle API Key"></label><div class="toolbar"><button class="primary">套用至本分頁</button><button type="button" data-service-clear>清除金鑰</button></div><p role="status">${e(feedback||(key?'本分頁已設定，連線尚未測試。':'尚未設定分時行情服務。'))}</p></form><p class="muted">金鑰只傳送至 Fugle 官方 API。瀏覽器跨來源限制或方案權限可能使連線不可用。</p>`);}
 async function intraday(symbol,row){
  const identity=`${row.name} ${symbol}`;
  if(!key)return ctx.status('請先設定分時行情服務','在服務設定輸入 Fugle 金鑰後，可載入當日 1 分鐘行情。')+ctx.card('',ctx.link('services'));
  if(!resolveListingStatus(symbol,taipeiDay(),ctx.state.listing).eligible)return ctx.status('目前市場資料不可用','上市資格尚未確認。');
  try{
   const response=await fetch(`https://api.fugle.tw/marketdata/v1.0/stock/intraday/candles/${encodeURIComponent(symbol)}?timeframe=1`,{headers:{'X-API-KEY':key},cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(12000)});
   if(!response.ok)throw new Error(response.status===401||response.status===403?'金鑰或行情方案權限不足。':response.status===429?'行情服務請求過多，請稍後重試。':`行情服務暫不可用（${response.status}）。`);
   const source=readIntraday(await response.json(),symbol);
   if(!resolveListingStatus(symbol,taipeiDay(),ctx.state.listing).eligible)return ctx.status('上市資格已過期','請同步今日上市資料後重試。');
   if(!source.rows.length)return ctx.status('當日尚無分時成交','來源未提供分時 K 線；可能尚未開盤或尚無成交。');
   const rows=source.rows,lo=Math.min(...rows.map(x=>x.low)),hi=Math.max(...rows.map(x=>x.high)),span=hi-lo||1,maxVolume=Math.max(...rows.map(x=>x.volume),1);
   const x=index=>40+index*640/Math.max(1,rows.length-1),y=value=>25+(hi-value)/span*185;
   const line=rows.map((row,index)=>`${x(index)},${y(row.close)}`).join(' '),bars=rows.map((row,index)=>`<rect x="${x(index)-1}" y="${290-row.volume/maxVolume*55}" width="2" height="${row.volume/maxVolume*55}" fill="currentColor"><title>${e(identity)} ${time(row.time)} 成交量 ${n(row.volume,0)} 張</title></rect>`).join('');
   const graph=`<svg class="chart" viewBox="0 0 720 330" role="img" aria-label="${e(identity)} ${e(source.date)} 原始分時價格與獨立成交量"><text x="40" y="18">${n(hi)}</text><text x="40" y="230">${n(lo)}</text><polyline points="${line}" fill="none" stroke="currentColor" stroke-width="2"/>${bars}<text x="40" y="318">${time(rows[0].time)}</text><text x="640" y="318">${time(rows.at(-1).time)}</text></svg>`;
   return ctx.card(`${identity}・1 分鐘行情`,`<p class="source muted">Fugle 原始市場價格・${e(source.date)}・最後成交 ${time(rows.at(-1).time)}</p>${graph}<p class="muted">一般整股交易成交量單位為張；價格與成交量使用獨立尺度。此頁依手動重新載入更新。</p><button data-action="reload">重新載入分時資料</button>`)+ctx.card('逐筆分鐘資料',`<details><summary>檢視 ${rows.length} 筆分鐘行情</summary>${rows.map(item=>`<p>${e(identity)} ${time(item.time)}<br>開 ${n(item.open)}・高 ${n(item.high)}・低 ${n(item.low)}・收 ${n(item.close)}・量 ${n(item.volume,0)} 張</p>`).join('')}</details>`);
  }catch(error){const message=error instanceof TypeError?'瀏覽器無法連線至行情服務；請確認網路與跨來源連線限制。':error.name==='TimeoutError'?'行情服務連線逾時。':error.message;return ctx.status('分時行情載入失敗',message,'↗',true)+ctx.card('',ctx.link('services'));}
 }
 async function priceBand(symbol,row){
  if(!key||!resolveListingStatus(symbol,taipeiDay(),ctx.state.listing).eligible)return null;
  const cached=priceBands.get(symbol);if(cached&&Date.now()-cached.at<(cached.value?300000:15000)){const b=cached.value;if(!b||String(row.asOf??'').slice(0,10)!==b.date||!Number.isFinite(row.price)||row.price<=0)return null;return b.unlimited?{valid:true,unlimited:true,unlimitedKind:b.unlimitedKind||'ipo',label:null}:{valid:true,label:Math.abs(row.price-b.up)<1e-6?'漲停':Math.abs(row.price-b.down)<1e-6?'跌停':null};}
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
  app.addEventListener('submit',async event=>{if(event.target.id!=='rebuild-service-form')return;event.preventDefault();const input=event.target.elements.fugle;key=input.value.trim();priceBands.clear();input.value='';feedback=key?'本分頁已設定；開啟股票分時頁取得行情。':'請輸入有效金鑰。';await ctx.refresh();});
  app.addEventListener('click',async event=>{if(!event.target.closest('[data-service-clear]'))return;key='';priceBands.clear();feedback='本分頁金鑰已清除。';await ctx.refresh();});
 }
 return {page,intraday,priceBand,listen};
}
