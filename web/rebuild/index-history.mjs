import {indexIntraday} from './index-intraday.mjs';
import {escapeHTML as e,number as n,taipeiDay} from './core.mjs';

export async function indexHistory(ctx){
 const {state,publicData,card,status}=ctx;
 const intraday=await indexIntraday(ctx);
 const symbols=[['IX0001','加權指數'],['IX0043','櫃買指數']],symbol=symbols.some(([s])=>s===state.indexHistorySymbol)?state.indexHistorySymbol:'IX0001',name=symbols.find(([s])=>s===symbol)[1];
 const count=[20,60,120,250].includes(state.indexHistoryCount)?state.indexHistoryCount:60;
 const dates=[...new Set((state.index.available_days_tw_indices||[]).filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&d<=taipeiDay()))].sort().slice(-count);
 const entries=[];let cursor=0;
 async function worker(){while(cursor<dates.length){const date=dates[cursor++];try{
  const data=await publicData(`daily/tw_indices/${date}.json`);
  if(data.date&&data.date!==date)throw Error('來源日期不符');
  if(!Array.isArray(data.stocks))throw Error('來源格式不符');
  const matches=data.stocks.filter(r=>r.id===symbol);if(matches.length!==1)throw Error(matches.length?'來源重複指數':'來源沒有此指數');
  const r=matches[0];if(typeof r.c!=='number'||!Number.isFinite(r.c)||r.c<=0)throw Error('收盤值無效');
  entries.push({date,close:r.c,volume:typeof r.v==='number'&&Number.isFinite(r.v)&&r.v>=0?r.v:null});
 }catch(error){entries.push({date,error:error.message});}}}
 await Promise.all(Array.from({length:Math.min(3,dates.length)},worker));entries.sort((a,b)=>a.date.localeCompare(b.date));
 const valid=entries.filter(r=>r.close>0),failed=entries.filter(r=>r.error);
 const controls=`<div class="toolbar"><label>市場指數<select data-index-symbol>${symbols.map(([s,label])=>`<option value="${s}" ${s===symbol?'selected':''}>${label} ${s}</option>`).join('')}</select></label><label>期間<select data-index-count>${[20,60,120,250].map(v=>`<option value="${v}" ${v===count?'selected':''}>最近 ${v} 個來源交易日</option>`).join('')}</select></label></div><p class="muted">每日收盤歷史，非盤中分時。日期依來源檔案；缺漏保留斷線。</p>`;
 if(!valid.length)return intraday+card('市場指數走勢',controls)+status('指數歷史資料不足',failed.length?'所選期間沒有可讀取的有效指數資料。':'尚無來源交易日。','↗',true);
 const lo=Math.min(...valid.map(r=>r.close)),hi=Math.max(...valid.map(r=>r.close)),span=hi-lo||1,x=i=>48+i/Math.max(1,entries.length-1)*640,y=v=>35+(hi-v)/span*170;
 const segments=[];let segment=[];entries.forEach((row,i)=>{if(row.close>0)segment.push({row,i});else if(segment.length){segments.push(segment);segment=[];}});if(segment.length)segments.push(segment);
 const lines=segments.map(points=>points.length===1?`<circle cx="${x(points[0].i)}" cy="${y(points[0].row.close)}" r="3" fill="var(--blue)"/>`:`<polyline points="${points.map(({row,i})=>`${x(i)},${y(row.close)}`).join(' ')}" fill="none" stroke="var(--blue)" stroke-width="2"/>`).join('');
 const vmax=Math.max(...valid.map(r=>r.volume??0),1),bars=entries.map((row,i)=>row.volume!==null&&row.volume!==undefined?`<rect x="${x(i)-2}" y="${285-row.volume/vmax*45}" width="4" height="${row.volume/vmax*45}" fill="var(--blue)"><title>${e(name)} ${symbol} ${row.date}・來源成交量 ${n(row.volume,0)}</title></rect>`:'').join('');
 const graph=`<svg class="chart" viewBox="0 0 736 320" role="img" aria-label="${e(name)} ${symbol} 每日收盤與獨立成交量"><text x="48" y="20">${n(hi)}</text><text x="48" y="224">${n(lo)}</text>${lines}${bars}<text x="48" y="310">${e(entries[0].date)}</text><text x="688" y="310" text-anchor="end">${e(entries.at(-1).date)}</text></svg>`;
 const records=`<details><summary>逐日數值（${valid.length}／${dates.length} 日）</summary>${entries.map(r=>`<p>${e(name)} ${symbol} ${e(r.date)}・${r.error?e(r.error):`收盤 ${n(r.close)}・來源成交量 ${r.volume===null?'資料不足':n(r.volume,0)}`}</p>`).join('')}</details>`;
 return intraday+card(`${name} ${symbol}・${n(valid.at(-1).close)}`,controls+`<p class="source">最後有效資料：${e(valid.at(-1).date)}</p>`+graph+`<p class="muted">成交量使用獨立尺度，保留來源數值；未將不同市場量能相加。${failed.length?`有 ${failed.length} 日未取得資料。`:''}</p>`+records);
}
