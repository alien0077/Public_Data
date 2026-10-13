import {escapeHTML as e,number as n,taipeiDay} from './core.mjs';
export async function indexIntraday({publicData,card}){
 try{
  const data=await publicData('rebuild/index-intraday.json');
  if(data.schemaVersion!==1||data.source!=='yahoo.chart.1m'||!Array.isArray(data.indices))throw Error('來源格式不符');
  const generated=Date.parse(data.generatedAt);if(!Number.isFinite(generated)||generated>Date.now()+60000)throw Error('快照時間無效');
  return card('指數分時快照',`<p><button data-action="reload">更新分時快照</button></p><p>定時更新，非即時行情。快照產生：${e(data.generatedAt)}。來源可能延遲。</p>`+[['IX0001','加權指數'],['IX0043','櫃買指數']].map(([symbol,name])=>{
   const matches=data.indices.filter(r=>r.symbol===symbol),row=matches.length===1?matches[0]:null;
   if(!row||row.status!=='AVAILABLE')return `<section><h3>${name} ${symbol}</h3><p role="status">分時資料暫不可用</p></section>`;
   if(!Array.isArray(row.points)||!row.points.length)throw Error('來源分時序列不足');
   let previous=-Infinity;const segments=[];let segment=[];
   for(const p of row.points){
    if(!Number.isFinite(p.timestamp)||p.timestamp<=previous||p.timestamp*1000>generated+60000)throw Error('分時時間無效');
    if(p.timestamp-previous>90&&segment.length){segments.push(segment);segment=[];}
    if(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(p.timestamp*1000))!==row.dataDate)throw Error('分時日期與來源資料日不符');
    previous=p.timestamp;
    if(Number.isFinite(p.close)&&p.close>0)segment.push(p);else if(segment.length){segments.push(segment);segment=[];}
   }
   if(segment.length)segments.push(segment);const valid=segments.flat();if(!valid.length)throw Error('沒有有效分時點位');
   const lo=Math.min(...valid.map(p=>p.close)),hi=Math.max(...valid.map(p=>p.close)),start=row.points[0].timestamp,end=row.points.at(-1).timestamp;
   const x=t=>30+(t-start)/(end-start||1)*580,y=c=>170-(c-lo)/(hi-lo||1)*140;
   const time=t=>new Date(t*1000).toLocaleTimeString('zh-TW',{timeZone:'Asia/Taipei',hour12:false,hour:'2-digit',minute:'2-digit'});
   return `<section><h3>${name} ${symbol}・${n(valid.at(-1).close)}</h3><p>${e(row.dataDate)} ${row.dataDate===taipeiDay()?'當日快照':'歷史快照，非今日行情'}</p><svg class="chart" viewBox="0 0 640 210" role="img" aria-label="${name} ${symbol} 分時快照">${segments.map(points=>points.length===1?`<circle cx="${x(points[0].timestamp)}" cy="${y(points[0].close)}" r="3" fill="var(--blue)"/>`:`<polyline fill="none" stroke="var(--blue)" stroke-width="2" points="${points.map(p=>`${x(p.timestamp)},${y(p.close)}`).join(' ')}"/>`).join('')}<text x="30" y="20">${n(hi)}</text><text x="30" y="195">${time(start)}</text><text x="610" y="195" text-anchor="end">${time(end)}</text></svg><details><summary>分時數值</summary>${row.points.map(p=>`<p>${name} ${symbol} ${time(p.timestamp)}・${Number.isFinite(p.close)&&p.close>0?n(p.close):'資料不足'}</p>`).join('')}</details></section>`;
  }).join(''));
 }catch(error){return card('指數分時快照',`<p role="status">尚無可用快照：${e(error.message)}</p><p>請更新市場資料後重試。</p><button data-action="reload">更新分時快照</button>`);}
}
