const DAY=86400;
const RANGE_DAYS={oneYear:365.2425,threeYears:3*365.2425,fiveYears:5*365.2425};
export const ETF_HISTORY_RANGES=[['oneYear','1年'],['threeYears','3年'],['fiveYears','5年'],['all','全部']];
export function decodeETFRawHistory(payload,symbol){
 if(!payload||payload.schemaVersion!==2||payload.symbol!==symbol||payload.source!=='data.daily.tw.raw_ohlcv'||payload.priceBasis!=='raw'||payload.dataQuality!=='explicit_rejected_dates_v1'||typeof payload.sourceManifestSHA256!=='string'||!/^[0-9a-f]{64}$/.test(payload.sourceManifestSHA256))throw Error('ETF 圖表來源契約不符');
 const fields=['timestamp','open','high','low','close','volume'];const count=payload.timestamp?.length;
 if(!Number.isInteger(count)||count<1||fields.some(field=>!Array.isArray(payload[field])||payload[field].length!==count))throw Error('ETF 圖表欄位長度不一致');
 const seen=new Set(),rows=[];
 for(let i=0;i<count;i++){
  const [time,open,high,low,close,volume]=fields.map(field=>payload[field][i]);
  if(!Number.isSafeInteger(time)||![open,high,low,close,volume].every(Number.isFinite)||open<=0||high<=0||low<=0||close<=0||volume<0||high<Math.max(open,close)||low>Math.min(open,close)||seen.has(time))throw Error(`ETF 原始 OHLCV 無效：第 ${i+1} 點`);
  seen.add(time);rows.push({time,open,high,low,close,volume,date:new Date(time*1000).toISOString().slice(0,10)});
 }
 if(rows.some((row,i)=>i>0&&row.time<=rows[i-1].time))throw Error('ETF 圖表日期未依序遞增');
 return rows;
}
export function decodeETFNavHistory(payload,symbol){
 const tpex=payload?.market==='TPEX'&&payload.source==='tpex.info.etfProduct.netPrice'&&payload.sourceURL===`https://info.tpex.org.tw/api/etfProduct?lang=zh-tw&query=${encodeURIComponent(symbol)}`;
 const twseRoutes=new Set(['t78sb30','t78sb32','t78sb33','t78sb34','t78sb35_new','t78sb37','t78sb38','t78sb39_new','t78sb40']);
 const twse=payload?.market==='TWSE'&&payload.source==='mops.twse.etf.netAssetValue'&&[...twseRoutes].some(route=>payload.sourceURL===`https://mopsov.twse.com.tw/mops/web/${route}`);
 const supportedCurrencies=new Set(['TWD','USD','JPY','HKD','CNY','EUR','GBP']);
 const currency=payload?.currency??payload?.points?.[0]?.currency??'TWD';
 if(!payload||payload.schemaVersion!==1||payload.symbol!==symbol||(!tpex&&!twse)||!supportedCurrencies.has(currency)||payload.unit!==`${currency}_per_unit`||payload.dateSemantics!=='Taipei exchange trading date'||!Number.isInteger(payload.pointCount)||!Array.isArray(payload.points)||payload.points.length===0||payload.pointCount!==payload.points.length||!/^[0-9a-f]{64}$/.test(payload.latestSourcePayloadSHA256??''))throw Error('ETF 官方淨值來源契約不符');
 const seen=new Set(),rows=[];
 for(const [i,point] of payload.points.entries()){
  const hash=point?.sourcePayloadSHA256;
  const parsedDate=Date.parse(`${point?.date}T00:00:00Z`);
  const pointCurrency=point?.currency??currency;
  if(pointCurrency!==currency||!/^\d{4}-\d{2}-\d{2}$/.test(point?.date??'')||!Number.isFinite(parsedDate)||new Date(parsedDate).toISOString().slice(0,10)!==point.date||!Number.isFinite(point.value)||point.value<=0||typeof point.retrievedAt!=='string'||!point.retrievedAt||!/^[0-9a-f]{64}$/.test(hash??'')||seen.has(point.date)||(i>0&&point.date<=payload.points[i-1].date))throw Error(`ETF 官方淨值資料無效：第 ${i+1} 筆`);
  seen.add(point.date);rows.push({...point,currency,time:Date.parse(`${point.date}T00:00:00Z`)/1000});
 }
 if(payload.firstDate!==rows[0].date||payload.latestDate!==rows.at(-1).date||payload.latestSourcePayloadSHA256!==rows.at(-1).sourcePayloadSHA256)throw Error('ETF 官方淨值範圍或最新來源 hash 不一致');
 return rows;
}
export function availableETFHistoryRanges(rows){
 if(!rows?.length)return [];
 const span=(rows.at(-1).time-rows[0].time)/DAY;
 return ETF_HISTORY_RANGES.filter(([id])=>id==='all'||span>=RANGE_DAYS[id]);
}
export function filterETFHistoryRange(rows,range){
 if(!rows?.length)return [];
 if(range==='all')return rows;
 const days=RANGE_DAYS[range];if(!days)return rows;
 const cutoff=rows.at(-1).time-days*DAY;
 return rows.filter(row=>row.time>=cutoff);
}
