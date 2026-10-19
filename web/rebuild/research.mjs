import {number as n,escapeHTML as e} from './core.mjs';
export function normalizedInstitutional(items,quick=false){return items.map(x=>({...x,institutionalNet:quick?(Number.isFinite(x.total_inst_buy)?x.total_inst_buy/1000:null):x.accumulated_inst_buy,trackingDays:quick?null:x.tracking_days,buyDays:quick?x.buy_days:null,flow:(x.daily_inst_flow||[]).map(p=>({date:p.date,value:Number.isFinite(p.value)?(quick?p.value/1000:p.value):null}))}));}
export function flowSeries(items,from='',to=''){const map=new Map();for(const x of items)for(const p of x.flow||[]){if((from&&p.date<from)||(to&&p.date>to)||!Number.isFinite(p.value))continue;map.set(p.date,(map.get(p.date)||0)+p.value);}return [...map].sort(([a],[b])=>a.localeCompare(b)).map(([date,value])=>({date,value}));}
export function median(values){const a=values.filter(v=>Number.isFinite(v)&&v>0).sort((a,b)=>a-b);return a.length?a.length%2?a[(a.length-1)/2]:(a[a.length/2-1]+a[a.length/2])/2:null;}
export function flowChart(points,identity='觀察名單'){if(!points.length)return '<p class="muted">所選日期尚無淨買賣超資料。</p>';const max=Math.max(...points.map(p=>Math.abs(p.value)),1),dx=600/points.length;return `<svg viewBox="0 0 680 220" class="chart" role="img" aria-label="${e(identity)}淨買賣超，單位張，紅色淨買超、綠色淨賣超"><line x1="40" x2="640" y1="100" y2="100" stroke="var(--line)"/><text x="40" y="15">＋${n(max,0)} 張</text>${points.map((p,i)=>`<rect x="${40+i*dx+dx*.1}" y="${p.value>=0?100-p.value/max*70:100}" width="${Math.max(1,dx*.8)}" height="${Math.max(1,Math.abs(p.value)/max*70)}" fill="${p.value>0?'var(--up)':p.value<0?'var(--down)':'var(--muted)'}"><title>${e(identity)} ${e(p.date)} ${p.value>0?'淨買超':p.value<0?'淨賣超':'平衡'} ${n(Math.abs(p.value))} 張</title></rect>`).join('')}<text x="40" y="198">${e(points[0].date)}</text><text x="540" y="198">${e(points.at(-1).date)}</text></svg><details><summary>查看逐日數值（張）</summary>${points.map(p=>`<p>${e(identity)} ${e(p.date)}　${p.value>0?'＋':''}${n(p.value)} 張</p>`).join('')}</details>`;}
export function etfPerformanceView(data,symbol){const row=data.etfs?.find(x=>x.etf_id===symbol);if(!row)return null;const basis={adjusted_close:'還原收盤價報酬',raw_close:'原始收盤價報酬'}[row.return_price_basis]||'報酬尺度未明';return {row,basis,datesValid:/^\d{4}-\d{2}-\d{2}$/.test(row.first_date||'')&&/^\d{4}-\d{2}-\d{2}$/.test(row.latest_date||'')&&row.first_date<=row.latest_date,returnValue:Number.isFinite(row.return_pct)?row.return_pct:null};}
export function rebalanceEntries(data){return [['added','新增'],['removed','移除'],['weight_up','權重增加'],['weight_down','權重減少']].flatMap(([key,label])=>(data[key]||[]).map(x=>({symbol:typeof x==='string'?x:x.stock_id,label,diff:typeof x==='object'&&Number.isFinite(x.diff)?x.diff:null})));}
export function fxConversion(amount,fromRate,toRate){if(!Number.isFinite(amount)||amount<0||!Number.isFinite(fromRate)||fromRate<=0||!Number.isFinite(toRate)||toRate<=0)return null;return amount*fromRate/toRate;}
export function fxRateDisplay(value){if(!Number.isFinite(value)||value<=0)return '資料不足';return new Intl.NumberFormat('zh-TW',{maximumSignificantDigits:6}).format(value);}
export function m25Tabs(active){return `<nav class="m25-tabs" aria-label="財經摘要與工具">${[['briefing','財經摘要'],['macro','宏觀總覽'],['fx','匯率工具'],['services','金鑰與服務設定']].map(([id,label])=>`<a href="#/${id}" ${active===id?'aria-current="page"':''}>${label}</a>`).join('')}</nav>`;}
export function uniquePublishDates(episodes){const valid=date=>{if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date))return false;const time=Date.parse(`${date}T00:00:00Z`);return Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===date;};return [...new Set((Array.isArray(episodes)?episodes:[]).map(item=>item?.publish_date).filter(valid))].sort((a,b)=>b.localeCompare(a));}
const fxRangeDays={'1w':7,'1m':31,'3m':93,'1y':365};
export function validFxRows(rows,cutoffDate){
 if(!Array.isArray(rows))return [];
 const cutoff=typeof cutoffDate==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(cutoffDate)?cutoffDate:null;
 const byDate=new Map();
 for(const row of rows){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(row?.date)||!Number.isFinite(row?.USD_TWD)||row.USD_TWD<=0||(cutoff&&row.date>cutoff))continue;
  const timestamp=Date.parse(`${row.date}T00:00:00Z`);
  if(Number.isFinite(timestamp)&&new Date(timestamp).toISOString().slice(0,10)===row.date)byDate.set(row.date,row);
 }
 return [...byDate.values()].sort((a,b)=>a.date.localeCompare(b.date));
}
export function fxRangePoints(rows,range='1w',cutoffDate){
 const days=fxRangeDays[range];if(!days||!Array.isArray(rows))return [];
 const ordered=validFxRows(rows,cutoffDate);if(!ordered.length)return [];
 const last=new Date(`${ordered.at(-1).date}T00:00:00Z`);last.setUTCDate(last.getUTCDate()-days+1);
 const start=last.toISOString().slice(0,10);
 return ordered.filter(row=>row.date>=start).map(row=>({date:row.date,value:row.USD_TWD}));
}
export function fxTrendChart(points){
 if(!Array.isArray(points)||points.length<2)return '<p class="muted" role="status">所選期間匯率歷史資料不足，無法繪製走勢。</p>';
 const values=points.map(p=>p.value),lo=Math.min(...values),hi=Math.max(...values),span=hi-lo||Math.max(Math.abs(hi)*.002,.001),min=lo-span*.08,max=hi+span*.08;
 const x=i=>54+i/(points.length-1)*560,y=v=>174-(v-min)/(max-min)*132;
 const coords=points.map((p,i)=>`${x(i).toFixed(2)},${y(p.value).toFixed(2)}`).join(' ');
 const grid=[0,.5,1].map(t=>{const val=max-t*(max-min),yy=42+t*132;return `<line x1="54" x2="614" y1="${yy}" y2="${yy}" stroke="var(--line)"/><text x="48" y="${yy+4}" text-anchor="end">${fxRateDisplay(val)}</text>`}).join('');
 return `<svg class="chart fx-trend-chart" viewBox="0 0 660 218" role="img" aria-label="美元兌新臺幣歷史匯率走勢，${points[0].date} 至 ${points.at(-1).date}"><title>美元兌新臺幣匯率歷史曲線</title>${grid}<polygon points="${x(0)},174 ${coords} ${x(points.length-1)},174" fill="var(--up)" fill-opacity=".12"/><polyline points="${coords}" fill="none" stroke="var(--up)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/><text x="54" y="202">${e(points[0].date.slice(5))}</text><text x="614" y="202" text-anchor="end">${e(points.at(-1).date.slice(5))}</text><text x="334" y="216" text-anchor="middle">日期・美元兌新臺幣（TWD / USD）</text></svg>`;
}
export function quantRows(portfolio,quotes){return portfolio.flatMap(p=>{const q=quotes.find(q=>q.symbol===p.stock);return q?[{...q,score:Number.isFinite(p.score)?p.score:null,weight:Number.isFinite(p.weight)?p.weight*100:null}]:[];});}
