import {cashflowRecords} from './cashflow.mjs';
// New cross-platform semantics. No legacy presentation code is imported.
export const number = (v, digits = 2) => { if(typeof v !== 'number' || !Number.isFinite(v))return '資料不足';let style='general';try{style=localStorage.getItem('rebuild.number-format.v1')??'general';}catch{}const maximumFractionDigits=style==='integer'?0:style==='precise'?Math.max(2,digits):digits;return new Intl.NumberFormat('zh-TW',{maximumFractionDigits}).format(v); };
export const finite = v => typeof v === 'number' && Number.isFinite(v) ? v : null;
export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function taipeiDay(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
}
function canonicalISODate(value) {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const parsed=new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===value;
}
export function validPriceReferenceContract(payload,day,today=taipeiDay()) {
  return payload?.schemaVersion===1
    && payload.basis==='official_raw_close_minus_signed_change'
    && canonicalISODate(day)&&canonicalISODate(today)
    && payload.date===day&&canonicalISODate(payload.cutoff)
    && payload.cutoff>=payload.date&&payload.cutoff<=today;
}
export function exchangeDateLabel(market,date) {
  const label=market==='US'?'美東交易日期':'台灣交易日期';
  return `${label} ${typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)?date:'日期不足'}`;
}
export function exchangeClockLabel(value=new Date(),market='TW') {
  const us=market==='US',timeZone=us?'America/New_York':'Asia/Taipei';
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(value);
  const fields=Object.fromEntries(parts.map(part=>[part.type,part.value]));
  return `${us?'美東當地時間':'台灣當地時間'} ${fields.year}-${fields.month}-${fields.day} ${fields.hour}:${fields.minute}${us?' ET':''}`;
}
export function exchangeClockMarkup(market='TW',value=new Date()) {
  const normalized=market==='US'?'US':'TW';
  return `<p class="source muted" data-exchange-clock="${normalized}">${escapeHTML(exchangeClockLabel(value,normalized))}</p>`;
}
export function updateExchangeClocks(root=document,value=new Date()) {
  root.querySelectorAll?.('[data-exchange-clock]').forEach(node=>{node.textContent=exchangeClockLabel(value,node.dataset.exchangeClock);});
}
export function resolveListingStatus(symbol, cutoff, snapshot) {
  if (!snapshot || snapshot.cutoff !== cutoff || snapshot.validThrough < cutoff) return {eligible:false,status:'UNKNOWN',reason:'STALE_OR_MISSING_LISTING_EVIDENCE'};
  const row = snapshot.stocks?.[symbol];
  return row?.status === 'LISTED' && row.eligible === true ? row : {...row, eligible:false,reason:row?.reason ?? 'UNKNOWN_LISTING_STATUS'};
}
export function identity(symbol, ...sources) {
  const name = sources.map(x => x?.name ?? x?.stock_name).find(x => typeof x === 'string' && x.trim());
  return {symbol:String(symbol),name:name?.trim() || String(symbol)};
}
export function rawRow(raw, meta, listing, date) {
  const id = String(raw.id ?? raw.symbol ?? '');
  const price = finite(raw.c ?? raw.close);
  // daily.pct is produced from adj_close. It must never enter market-price UI.
  // Only explicit exchange reference prices allow a same-scale daily change.
  return {...identity(id,meta,listing),price:price > 0 ? price : null,change:rawChange(raw,price),
    changePercent:rawPercent(raw,price),volume:finite(raw.v ?? raw.volume),turnover:finite(raw.t),
    sector:meta?.official_sector ?? '',industry:meta?.industry ?? meta?.official_sector ?? '',market:listing?.market ?? meta?.market ?? '',
    securityType:listing?.securityType ?? 'unknown',asOf:raw.date ?? date,
    marketCap:finite(meta?.market_cap),pe:null,yield:null,
    foreignNet:finite(raw.f),trustNet:finite(raw.it),dealerNet:finite(raw.d),open:finite(raw.o),high:finite(raw.h),low:finite(raw.l),
    referencePrice:finite(raw.referencePrice),limitUp:finite(raw.limitUp),limitDown:finite(raw.limitDown)};
}
export function searchDirectoryRows(dailyRows, metadata, listing, cutoff) {
  const metadataProvided = metadata instanceof Map || Array.isArray(metadata?.stocks);
  const stockMetadata = metadata instanceof Map
    ? metadata
    : new Map((Array.isArray(metadata?.stocks) ? metadata.stocks : []).map(row => [String(row?.symbol ?? ''), row]));
  const universe = metadataProvided ? stockMetadata : new Map(Object.entries(listing?.stocks ?? {}));
  const listedEntry = (symbol, meta) => {
    const evidence = listing?.stocks?.[symbol] ?? {};
    return {...evidence, symbol, name:meta?.name ?? evidence.name, status:'LISTED', eligible:true,
      reason:'CURRENT_PUBLIC_DATA_STOCK_UNIVERSE',
      securityType:evidence.securityType ?? (meta?.official_sector === 'ETF' ? 'fund' : 'equity'),
      market:meta?.market ?? evidence.market ?? ''};
  };
  const rows = new Map();
  for (const row of Array.isArray(dailyRows) ? dailyRows : []) {
    const symbol = String(row?.symbol ?? row?.id ?? '').trim();
    if (symbol && (metadataProvided ? stockMetadata.has(symbol) : resolveListingStatus(symbol, cutoff, listing).eligible)) {
      const meta = stockMetadata.get(symbol), evidence = listedEntry(symbol, meta);
      rows.set(symbol, {...row, ...identity(symbol, row, meta, evidence), market:row.market ?? meta?.market ?? evidence.market,
        securityType:row.securityType ?? evidence.securityType});
    }
  }
  for (const [symbol, meta] of universe) {
    if (!symbol || rows.has(symbol)) continue;
    const evidence = listedEntry(symbol, meta);
    // Directory candidates come from the canonical current stock universe.
    // Missing daily quotes stay null; this helper must never invent prices.
    rows.set(symbol, rawRow({id:symbol}, meta, evidence, null));
  }
  return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant') || a.symbol.localeCompare(b.symbol));
}
export function canonicalUSIndexRows(current,previous,date) {
  if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date))return [];
  const names={'^DJI':'道瓊工業指數','^IXIC':'NASDAQ 綜合指數','^GSPC':'S&P 500 指數','^SOX':'費城半導體指數',TSM:'台積電 ADR'};
  const previousRows=previous?.stocks??[],previousDate=previousRows.find(row=>typeof row.date==='string')?.date;
  const prior=new Map(previousRows.filter(row=>row.date===previousDate&&Number.isFinite(row.c)&&row.c>0).map(row=>[row.id,row.c]));
  return (current?.stocks??[]).filter(row=>Object.hasOwn(names,row.id)&&row.date===date).map(row=>{
    const base=rawRow(row,{},null,date),reference=previousDate<date?prior.get(row.id):null,change=Number.isFinite(base.price)&&Number.isFinite(reference)?base.price-reference:null;
    return {...base,change,changePercent:change!==null&&reference>0?change/reference*100:null,referencePrice:reference??null,name:names[row.id],market:'US'};
  });
}
export function limitStatus(row) {
  if (!(row.price > 0) || !(row.referencePrice > 0)) return null;
  if (row.limitUp > row.referencePrice && Math.abs(row.price-row.limitUp) < 0.000001) return '漲停';
  if (row.limitDown > 0 && row.limitDown < row.referencePrice && Math.abs(row.price-row.limitDown) < 0.000001) return '跌停';
  return null;
}
export function stockTick(price) {
  if(!Number.isFinite(price)||price<=0)return null;
  if(price<10)return 0.01;if(price<50)return 0.05;if(price<100)return 0.1;
  if(price<500)return 0.5;if(price<1000)return 1;return 5;
}
export function etfTick(price){if(!Number.isFinite(price)||price<=0)return null;return price<50?0.01:0.05;}
function quantizePrice(target,side,tickForPrice){
  if(!Number.isFinite(target)||target<=0)return null;
  let tick=tickForPrice(target);
  for(let i=0;i<4;i++){
    const units=target/tick;
    const value=(side==='up'?Math.floor(units+1e-9):Math.ceil(units-1e-9))*tick;
    const rounded=Math.round(value*100)/100;
    const next=tickForPrice(rounded);
    if(next===tick&&rounded>0)return rounded;
    tick=next;
  }
  return null;
}
const quantizeStockPrice=(target,side)=>quantizePrice(target,side,stockTick);
const quantizeETFPrice=(target,side)=>quantizePrice(target,side,etfTick);
export function etfPriceLimitRegime(fund){
  const source=typeof fund==='string'?null:fund,fundType=source?.fundType??fund;
  const fact=source?.priceLimit;
  if(fact&&typeof fact==='object'){
    if(fact.regime==='NO_LIMIT')return {regime:'NO_LIMIT',multiplier:null};
    if(fact.regime==='DOMESTIC_TEN_PERCENT')return {regime:'DOMESTIC_ETF_10',multiplier:1};
    if(fact.regime==='DOMESTIC_LEVERAGED'&&Number.isInteger(fact.multiplier)&&fact.multiplier>=1&&fact.multiplier<=2)return {regime:'DOMESTIC_LEVERAGED',multiplier:fact.multiplier};
    if(fact.regime)return {regime:'UNKNOWN',multiplier:null};
  }
  const domestic=new Set(['國內成分證券指數股票型基金','國內成分證券主動式交易所交易基金(股票)']);
  const unlimited=new Set(['國外成分證券指數股票型基金','國外成分證券主動式交易所交易基金(股票)','國外成分證券主動式交易所交易基金(債券)','國外成分證券平衡型指數股票型基金','國外成份/加掛外幣證券指數股票型基金','連結式證券指數股票型基金']);
  if(domestic.has(fundType))return {regime:'DOMESTIC_ETF_10',multiplier:1};
  if(unlimited.has(fundType))return {regime:'NO_LIMIT',multiplier:null};
  return {regime:'UNKNOWN',multiplier:null};
}
export function calculatePriceBand({referencePrice,securityType,market,regime,multiplier=1}){
  const stock=securityType==='equity'&&regime==='STANDARD_EQUITY_10';
  const domesticETF=securityType==='fund'&&['DOMESTIC_ETF_10','DOMESTIC_LEVERAGED'].includes(regime)&&Number.isInteger(multiplier)&&multiplier>=1&&multiplier<=2;
  const allowed=stock||domesticETF;
  if(!allowed||!['TWSE','TPEX'].includes(market)||!Number.isFinite(referencePrice)||referencePrice<=0)return null;
  const ratio=stock?1:multiplier,tick=stock?quantizeStockPrice:quantizeETFPrice;
  const limitUp=tick(referencePrice*(1+.1*ratio),'up'),limitDown=tick(referencePrice*(1-.1*ratio),'down');
  return Number.isFinite(limitUp)&&Number.isFinite(limitDown)&&limitUp>referencePrice&&limitDown>0&&limitDown<referencePrice?{referencePrice,limitUp,limitDown,regime}:null;
}
export const defaultPreference = () => ({version:1,fields:['price','changePercent','volume','sector'],sort:'changePercent',descending:true});
export function normalizePreference(value, available) {
  const defaults=defaultPreference();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return defaults;
  const version=Number.isInteger(value.version)?value.version:0;
  if(version<0||version>1)return defaults;
  const raw=Array.isArray(value.fields)?value.fields:Array.isArray(value.visibleFields)?value.visibleFields:defaults.fields;
  const selected=new Set(raw.filter(x=>typeof x==='string'));
  const ordered=Array.isArray(value.fieldOrder)?value.fieldOrder.filter(x=>selected.has(x)).concat(raw.filter(x=>!value.fieldOrder.includes(x))):raw;
  const fields=[...new Set(ordered.filter(x=>available.includes(x)))];
  if(!fields.length)fields.push(...defaults.fields.filter(x=>available.includes(x)));
  const sort=value.sort??value.sortField;
  return {version:1, fields, sort:available.includes(sort)?sort:defaults.sort,
    descending:(typeof value.descending==='boolean'?value.descending:typeof value.sortDescending==='boolean'?value.sortDescending:true),manual:value.manual===true};
}
export function compareCodepoints(left,right) {
  const a=Array.from(String(left),x=>x.codePointAt(0)),b=Array.from(String(right),x=>x.codePointAt(0));
  for(let i=0;i<Math.min(a.length,b.length);i++)if(a[i]!==b[i])return a[i]-b[i];
  return a.length-b.length;
}
export function sortRows(rows,pref) {
  if(pref.manual===true)return [...rows];
  return [...rows].sort((a,b) => {
    const x=a[pref.sort],y=b[pref.sort];
    if (x == null && y == null) return compareCodepoints(a.symbol,b.symbol);
    if (x == null) return 1; if(y == null) return -1;
    const v=typeof x==='string'?compareCodepoints(x,y):x-y;
    return v===0?compareCodepoints(a.symbol,b.symbol):v*(pref.descending?-1:1);
  });
}
export function normalizeFavorites(value) {
  if (value == null) return {};
  if (Array.isArray(value) && value.every(x=>typeof x==='string')) return {cat1:[...new Set(value)]};
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error('自選資料格式尚未支援，原始資料已保留');
  const result=Object.create(null);
  for(const [key,items] of Object.entries(value)) {
    if(!Array.isArray(items) || !items.every(x=>typeof x==='string')) throw new Error('自選分類格式尚未支援，原始資料已保留');
    result[key]=[...new Set(items)];
  }
  return result;
}
const dailySnapshotRequests=new Map();
export async function loadRecentDailyChart(symbol,index,fetchData) {
 const latest=index?.latest_daily_tw,available=index?.available_days_tw;
 if(typeof latest!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(latest)||!Array.isArray(available)||typeof fetchData!=='function')throw new Error('canonical 最近日行情索引不足');
 const cutoff=new Date(Date.parse(latest+'T00:00:00Z')-30*86400000).toISOString().slice(0,10),dates=available.filter(day=>typeof day==='string'&&day>=cutoff&&day<=latest).slice(-24);
 if(!dates.length)throw new Error('最近30日沒有可用交易日索引');
 const snapshots=[];
 for(let start=0;start<dates.length;start+=4){
  const batch=await Promise.all(dates.slice(start,start+4).map(day=>{
   const path=`daily/tw/${day}.json`;
   if(!dailySnapshotRequests.has(path))dailySnapshotRequests.set(path,Promise.resolve().then(()=>fetchData(path)).catch(error=>{dailySnapshotRequests.delete(path);throw error;}));
   return dailySnapshotRequests.get(path);
  }));
  snapshots.push(...batch);
 }
 return readDailyChartSnapshots(symbol,dates,snapshots);
}
export function changeFromRecentRawCloses(row,index,chart) {
 const rows=chart?.rows,latest=index?.latest_daily_tw;
 if(!Array.isArray(rows)||rows.length<2||!row||row.asOf!==latest||chart.observedDates?.at(-1)!==latest)return null;
 const current=rows.at(-1),previous=rows.at(-2);
 if(!current||!previous||current.gapBefore||!(current.close>0)||!(previous.close>0)||!(row.price>0)||Math.abs(current.close-row.price)>1e-8)return null;
 const change=current.close-previous.close,changePercent=change/previous.close*100;
 return Number.isFinite(change)&&Number.isFinite(changePercent)?{change,changePercent,referencePrice:previous.close,referenceDate:previous.date}:null;
}
export function withPreviousRawClose(row,current,previous,latestDate,previousDate){
 if(!row||!current||!previous||row.asOf!==latestDate||current.date!==latestDate||previous.date!==previousDate||!(previousDate<latestDate)||!(row.price>0))return row;
 if(Number.isFinite(row.change)&&Number.isFinite(row.changePercent)&&Number.isFinite(row.referencePrice)&&row.referencePrice>0)return row;
 const currentRows=(current.stocks??[]).filter(x=>x?.id===row.symbol&&x.date===latestDate),previousRows=(previous.stocks??[]).filter(x=>x?.id===row.symbol&&x.date===previousDate);
 if(currentRows.length!==1||previousRows.length!==1)return row;
 const currentClose=finite(currentRows[0].c),previousClose=finite(previousRows[0].c);
 if(!(currentClose>0&&previousClose>0)||Math.abs(currentClose-row.price)>1e-8)return row;
 const change=currentClose-previousClose,changePercent=change/previousClose*100;
 return Number.isFinite(change)&&Number.isFinite(changePercent)?{...row,change,changePercent,referencePrice:previousClose,referenceDate:previousDate}:row;
}

export function readDailyChartSnapshots(symbol,dates,snapshots) {
 if(typeof symbol!=='string'||!symbol||!Array.isArray(dates)||!Array.isArray(snapshots)||dates.length!==snapshots.length||!dates.length)throw new Error('每日行情快照未對齊');
 const rows=[];let missingSinceLast=false,previousDate=null;
 for(let i=0;i<dates.length;i++){
  const date=dates[i],payload=snapshots[i];
  if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||payload?.date!==date||!Array.isArray(payload.stocks))throw new Error('每日行情快照日期或結構無效');
  const source=payload.stocks.find(item=>item?.id===symbol&&item?.date===date);
  if(!source){missingSinceLast=true;continue;}
  const row={date,time:Date.parse(date+'T00:00:00Z')/1000,open:finite(source.o),high:finite(source.h),low:finite(source.l),close:finite(source.c),volume:finite(source.v),gapBefore:missingSinceLast};
  if(!(row.open>0&&row.high>=Math.max(row.open,row.close)&&row.low>0&&row.low<=Math.min(row.open,row.close)&&row.close>0&&row.volume!==null&&row.volume>=0)){missingSinceLast=true;continue;}
  if(previousDate&&date<=previousDate)throw new Error('每日行情快照日期未遞增');
  rows.push(row);previousDate=date;missingSinceLast=false;
 }
 if(!rows.length)throw new Error('最近一個月沒有有效的個股原始 OHLCV');
 return {rows,observedDates:rows.map(row=>row.date),requestedDates:[...dates],missingDates:dates.filter(date=>!rows.some(row=>row.date===date))};
}
export function readChart(payload,expectedSymbol) {
  if(expectedSymbol!==undefined&&payload?.symbol!==expectedSymbol)throw new Error('圖表來源證券與所選證券不符');
  if(payload?.schemaVersion!==2||payload.source!=='data.daily.tw.raw_ohlcv'||payload.priceBasis!=='raw'||!/^([a-f0-9]{64})$/.test(payload.sourceManifestSHA256??'')||payload.dataQuality!=='explicit_rejected_dates_v1'||!Array.isArray(payload.rejectedDates))throw new Error('圖表來源尚未具備可驗證原始 OHLCV 與拒收日期證據');
  if(!payload.rejectedDates.every(d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d+'T00:00:00Z'))&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d))throw new Error('圖表拒收日期格式無效');
  const n=payload.timestamp?.length;
  if(!Number.isInteger(n)||!['open','high','low','close','volume'].every(k=>Array.isArray(payload[k])&&payload[k].length===n))throw new Error('圖表日期與OHLCV未對齊');
  const rsi=payload.rsi14??payload.rsi,adj=payload.adj_close;
  for(const column of [rsi,adj,payload.foreign_net,payload.trust_net,payload.dealer_net])if(column!==undefined&&(!Array.isArray(column)||column.length!==n))throw new Error('圖表指標或還原價日期未對齊');
  const seen=new Set();
  const rows=payload.timestamp.map((t,i)=>({foreign_net:payload.institutionalUnit==='lots'?finite(payload.foreign_net?.[i]):null,trust_net:payload.institutionalUnit==='lots'?finite(payload.trust_net?.[i]):null,dealer_net:payload.institutionalUnit==='lots'?finite(payload.dealer_net?.[i]):null,rsi14:rsi&&Number.isFinite(rsi[i])&&rsi[i]>=0&&rsi[i]<=100?rsi[i]:null,adj_close:adj&&Number.isFinite(adj[i])&&adj[i]>0?adj[i]:null,time:t,open:finite(payload.open[i]),high:finite(payload.high[i]),low:finite(payload.low[i]),close:finite(payload.close[i]),volume:finite(payload.volume[i])})).filter(p=>Number.isFinite(p.time)&&p.open>0&&p.close>0&&p.low>0&&p.high>=Math.max(p.open,p.close)&&p.low<=Math.min(p.open,p.close)&&p.volume!==null&&p.volume>=0).sort((a,b)=>a.time-b.time);
  const rejected=[...new Set(payload.rejectedDates)].sort();
  let previousDay=null,postGapWarmup=0;
  return rows.map((row,index)=>{
   if(seen.has(row.time))throw new Error('圖表日期重複');seen.add(row.time);
   const day=new Date(row.time*1000).toISOString().slice(0,10);
   const gapBefore=(previousDay===null&&rejected.some(d=>d<day))||(previousDay!==null&&rejected.some(d=>d>previousDay&&d<day));
   if(gapBefore)postGapWarmup=14;
   if(postGapWarmup>0){row.rsi14=null;postGapWarmup--;}
   row.gapBefore=gapBefore;row.date=day;previousDay=day;return row;
  });
}

export function rawReference(raw) {
 const reference=finite(raw.referencePrice ?? raw.reference_price);
 return reference>0?reference:null;
}
export function rawChange(raw,price=finite(raw.c??raw.close)) {
 const reference=rawReference(raw);return reference>0&&price>0?price-reference:null;
}
export function rawPercent(raw,price=finite(raw.c??raw.close)) {
 const reference=rawReference(raw);return reference>0&&price>0?(price/reference-1)*100:null;
}
export function normalizeTradeRecord(t) {
 const symbol=String(t.symbol??t.stock_id??''),name=String(t.name??t.stockName??symbol);
 const side=String(t.side??t.type??'');
 const direction=['buy','買進','買入'].includes(side)?1:['sell','賣出'].includes(side)?-1:0;
 const quantity=finite(t.quantity??t.shares),price=finite(t.price),fee=finite(t.fee)??0,tax=finite(t.tax)??0;
 const date=typeof (t.tradeDate??t.date)==='string'?String(t.tradeDate??t.date).slice(0,10):'';
 return {symbol,name,direction,quantity,price,fee,tax,date,valid:!!symbol&&direction!==0&&quantity>0&&price>=0&&fee>=0&&tax>=0&&/^\d{4}-\d{2}-\d{2}$/.test(date)};
}
export function tradeProjection(trades,quotes) {
 const positions=new Map(),issues=[];
 for(const raw of [...trades].sort((a,b)=>normalizeTradeRecord(a).date.localeCompare(normalizeTradeRecord(b).date))){
  if(String(raw.type??raw.side??'')==='配息'){if(cashflowRecords([raw]).issues.length)issues.push('配息紀錄格式待核對，完整資產核算未通過');continue;}
  const t=normalizeTradeRecord(raw);
  if(!t.valid){issues.push('含非買賣、日期或格式尚未支援紀錄，完整資產核算未通過');continue;}
  const p=positions.get(t.symbol)||{symbol:t.symbol,name:t.name,shares:0,lots:[],realized:0};
  if(t.direction===1){p.lots.push({shares:t.quantity,cost:t.quantity*t.price+t.fee+t.tax});p.shares+=t.quantity;}
  else if(t.quantity>p.shares){issues.push(`${t.name} ${t.symbol} 賣出超過已知持股`);continue;}
  else {let remain=t.quantity,basis=0;while(remain>0&&p.lots.length){const lot=p.lots[0],q=Math.min(remain,lot.shares),c=lot.cost*q/lot.shares;basis+=c;lot.shares-=q;lot.cost-=c;remain-=q;if(lot.shares<1e-9)p.lots.shift();}p.shares-=t.quantity;p.realized+=t.quantity*t.price-t.fee-t.tax-basis;}
  positions.set(t.symbol,p);
 }
 return {issues:[...new Set(issues)],rows:[...positions.values()].filter(p=>p.shares>1e-9).map(p=>{const q=quotes.find(q=>q.symbol===p.symbol),basis=p.lots.reduce((s,l)=>s+l.cost,0);return {...q,...p,name:q?.name||p.name,price:q?.price??null,cost:basis/p.shares,pnl:q?.price!=null?q.price*p.shares-basis:null,value:q?.price!=null?q.price*p.shares:null};})};
}

// A sidecar may supply a raw difference only for the exact canonical close/date.
export function withPriceReference(raw,payload,day){
 if(!validPriceReferenceContract(payload,day))return raw;
 const symbol=String(raw.id??raw.symbol??''),row=payload.stocks?.[symbol],close=finite(raw.c??raw.close);
 if(!row||row.symbol!==symbol||row.date!==day||!(close>0)||![row.close,row.change,row.referencePrice].every(Number.isFinite)||!(row.referencePrice>0)||Math.abs(row.close-close)>=1e-8||Math.abs(row.close-row.change-row.referencePrice)>=1e-8)return raw;
 return {...raw,referencePrice:row.referencePrice};
}
