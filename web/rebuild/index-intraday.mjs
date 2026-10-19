import {escapeHTML as e,number as n,taipeiDay} from './core.mjs';
export async function indexIntradayBySymbol({publicData,state}){
 const result={},unavailable=new Set();
 try{
  const data=await publicData('rebuild/index-intraday.json');
  if(data.schemaVersion!==1||data.source!=='yahoo.chart.1m'||!Array.isArray(data.indices))throw Error('來源格式不符');
  const generated=Date.parse(data.generatedAt);if(!Number.isFinite(generated)||generated>Date.now()+60000)throw Error('快照時間無效');
  for(const [symbol,name] of [['IX0001','加權指數'],['IX0043','櫃買指數']]){
   const matches=data.indices.filter(r=>r.symbol===symbol),row=matches.length===1?matches[0]:null;
   if(!row||row.status!=='AVAILABLE'){result[symbol]='<p role="status">分時資料暫不可用</p>';unavailable.add(symbol);continue;}
   if(!Array.isArray(row.points)||!row.points.length)throw Error('來源分時序列不足');
   let previous=-Infinity;const segments=[];let segment=[];
   for(const p of row.points){
    if(!Number.isFinite(p.timestamp)||p.timestamp<=previous||p.timestamp*1000>generated+60000)throw Error('分時時間無效');
    if(p.timestamp-previous>90&&segment.length){segments.push(segment);segment=[];}
    if(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(p.timestamp*1000))!==row.dataDate)throw Error('分時日期與來源資料日不符');
    previous=p.timestamp;
    if(Number.isFinite(p.close)&&p.close>0)segment.push(p);else if(segment.length){segments.push(segment);segment=[];}
   }
   if(segment.length)segments.push(segment);
   const valid=segments.flat();if(!valid.length)throw Error('沒有有效分時點位');
   const lo=Math.min(...valid.map(p=>p.close)),hi=Math.max(...valid.map(p=>p.close)),start=valid[0].timestamp,end=valid.at(-1).timestamp,dailyChange=state.indices?.find(item=>item.symbol===symbol)?.changePercent,color=Number.isFinite(dailyChange)?dailyChange>0?'var(--up)':dailyChange<0?'var(--down)':'var(--muted)':'var(--muted)';
   const range=hi-lo||Math.max(1,Math.abs(hi)*0.001),low=lo-range*0.08,high=hi+range*0.08;
   const x=t=>120+(t-start)/(end-start||1)*494,y=c=>89-(c-low)/(high-low)*54;
   const yTicks=[low,(low+high)/2,high],xTicks=[start,(start+end)/2,end];
   const time=t=>new Date(t*1000).toLocaleTimeString('zh-TW',{timeZone:'Asia/Taipei',hour12:false,hour:'2-digit',minute:'2-digit'});
   const generatedLabel=new Date(generated).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
   result[symbol]=`<div class="index-intraday-heading"><small>${e(row.dataDate)} ${row.dataDate===taipeiDay()?'當日快照':'歷史快照，非今日行情'}・更新 ${e(generatedLabel)}</small><button data-action="reload" aria-label="更新${name}分時快照" title="更新分時快照">↻</button></div><svg class="chart index-sparkline" viewBox="0 0 640 156" role="img" aria-label="${name} ${symbol} 分時走勢，縱軸指數，橫軸台北時間"><text x="112" y="18" class="axis-title">Y 軸・指數</text>${yTicks.map(v=>`<line x1="110" x2="614" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="106" y="${y(v)+4}" text-anchor="end">${n(v)}</text>`).join('')}${segments.map(points=>points.length<2?'':`<polygon points="${x(points[0].timestamp)},${y(low)} ${points.map(p=>`${x(p.timestamp)},${y(p.close)}`).join(' ')} ${x(points.at(-1).timestamp)},${y(low)}" fill="${color}" fill-opacity=".32"/>`).join('')}<line x1="110" x2="110" y1="32" y2="89" class="axis"/><line x1="110" x2="614" y1="89" y2="89" class="axis"/>${xTicks.map(t=>`<text x="${x(t)}" y="103" text-anchor="${t===start?'start':t===end?'end':'middle'}">${time(t)}</text>`).join('')}<text x="362" y="119" text-anchor="middle" class="axis-title">X 軸・台北時間</text>${segments.map(points=>points.length===1?`<circle cx="${x(points[0].timestamp)}" cy="${y(points[0].close)}" r="3" fill="${color}"/>`:`<polyline fill="none" stroke="${color}" stroke-width="2" points="${points.map(p=>`${x(p.timestamp)},${y(p.close)}`).join(' ')}"/>`).join('')}</svg>`;
   }
  if(unavailable.size){const history=await dailyIndexHistory({publicData,state});for(const symbol of unavailable)if(history[symbol])result[symbol]=history[symbol];}
 }catch(error){
  const history=await dailyIndexHistory({publicData,state});
  for(const row of state.indices??[]){
   if(history[row.symbol]){result[row.symbol]=history[row.symbol];continue;}
   if(row.symbol==='IX0001'||row.symbol==='IX0043'){
    result[row.symbol]=`<p role="status">分時快照暫不可用；台股指數日線歷史亦不可用：${e(error.message)}</p>`;
    continue;
   }
   result[row.symbol]='<p role="status">Public_Data 未提供此美股／ADR 分時序列；上方顯示最近可用的 Public_Data 日線收盤。</p>';
  }
 }
 return result;
}

async function dailyIndexHistory({publicData,state}){
 const result={},dates=[...new Set(state.index?.available_days_tw_indices??[])].filter(date=>/^\d{4}-\d{2}-\d{2}$/.test(date)&&date<=taipeiDay()).sort().slice(-22);
 if(dates.length<2)return result;
 const records=new Map();let cursor=0;
 async function worker(){while(cursor<dates.length){const date=dates[cursor++];try{const data=await publicData(`daily/tw_indices/${date}.json`);if(data.date&&data.date!==date)continue;if(!Array.isArray(data.stocks))continue;for(const symbol of ['IX0001','IX0043']){const rows=data.stocks.filter(row=>row.id===symbol),close=rows.length===1?rows[0].c:null;if(Number.isFinite(close)&&close>0){const current=records.get(symbol)??[];current.push({date,close});records.set(symbol,current);}}}catch{}}
 }
 await Promise.all(Array.from({length:4},worker));
 const dateIndex=new Map(dates.map((date,index)=>[date,index]));
 for(const [symbol,name] of [['IX0001','加權指數'],['IX0043','櫃買指數']]){
  const points=(records.get(symbol)??[]).sort((a,b)=>a.date.localeCompare(b.date));if(points.length<2)continue;
  const low=Math.min(...points.map(p=>p.close)),high=Math.max(...points.map(p=>p.close)),pad=Math.max((high-low)*.08,Math.abs(high)*.001),bottom=low-pad,top=high+pad;
  const firstClose=points[0].close,lastClose=points.at(-1).close,periodChange=lastClose-firstClose,color=periodChange>0?'var(--up)':periodChange<0?'var(--down)':'var(--muted)';
  const x=date=>120+(dateIndex.get(date)??0)/Math.max(1,dates.length-1)*494,y=v=>74-(v-bottom)/(top-bottom)*42;
  const segments=[];let current=[],lastIndex=-2;
  for(const point of points){const position=dateIndex.get(point.date)??0;if(current.length&&position>lastIndex+1){segments.push(current);current=[];}current.push(point);lastIndex=position;}
  if(current.length)segments.push(current);
  const ticks=[bottom,(bottom+top)/2,top],tickDates=[dates[0],dates[Math.floor((dates.length-1)/2)],dates.at(-1)];
  const shapes=segments.map(rows=>{const line=rows.map(point=>`${x(point.date)},${y(point.close)}`).join(' '),area=`${x(rows[0].date)},${y(bottom)} ${line} ${x(rows.at(-1).date)},${y(bottom)}`;return rows.length===1?`<circle cx="${x(rows[0].date)}" cy="${y(rows[0].close)}" r="3" fill="${color}"/>`:`<polygon points="${area}" fill="${color}" fill-opacity=".32"/><polyline fill="none" stroke="${color}" stroke-width="2" points="${line}"/>`;}).join('');
  result[symbol]=`<p class="index-history-meta">原始日線・非盤中・${e(points[0].date)}–${e(points.at(-1).date)}・${points.length} 交易日</p><svg class="chart index-sparkline" viewBox="0 0 640 156" role="img" aria-label="${name} ${symbol} 近一月日線歷史，縱軸原始指數收盤，橫軸交易日"><text x="112" y="15" class="axis-title">Y 軸・原始收盤</text>${ticks.map(v=>`<line x1="110" x2="614" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="106" y="${y(v)+4}" text-anchor="end">${n(v)}</text>`).join('')}<line x1="110" x2="110" y1="23" y2="74" class="axis"/><line x1="110" x2="614" y1="74" y2="74" class="axis"/>${shapes}${tickDates.map((date,i)=>`<text x="${x(date)}" y="94" text-anchor="${i===0?'start':i===tickDates.length-1?'end':'middle'}">${date.slice(5)}</text>`).join('')}<text x="362" y="117" text-anchor="middle" class="axis-title">X 軸・交易日</text></svg>`;
 }
 return result;
}
export async function indexIntraday(ctx){
 const {state,publicData,card}=ctx;
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
   const lo=Math.min(...valid.map(p=>p.close)),hi=Math.max(...valid.map(p=>p.close)),start=row.points[0].timestamp,end=row.points.at(-1).timestamp,dailyChange=ctx.state.indices?.find(item=>item.symbol===symbol)?.changePercent,color=Number.isFinite(dailyChange)?dailyChange>0?'var(--up)':dailyChange<0?'var(--down)':'var(--muted)':'var(--muted)';
   const x=t=>30+(t-start)/(end-start||1)*580,y=c=>170-(c-lo)/(hi-lo||1)*140;
   const time=t=>new Date(t*1000).toLocaleTimeString('zh-TW',{timeZone:'Asia/Taipei',hour12:false,hour:'2-digit',minute:'2-digit'});
   return `<section><h3>${name} ${symbol}・${n(valid.at(-1).close)}</h3><p>${e(row.dataDate)} ${row.dataDate===taipeiDay()?'當日快照':'歷史快照，非今日行情'}</p><svg class="chart" viewBox="0 0 640 210" role="img" aria-label="${name} ${symbol} 分時快照">${segments.map(points=>points.length<2?'':`<polygon points="${x(points[0].timestamp)},170 ${points.map(p=>`${x(p.timestamp)},${y(p.close)}`).join(' ')} ${x(points.at(-1).timestamp)},170" fill="${color}" fill-opacity=".32"/>`).join('')}${segments.map(points=>points.length===1?`<circle cx="${x(points[0].timestamp)}" cy="${y(points[0].close)}" r="3" fill="${color}"/>`:`<polyline fill="none" stroke="${color}" stroke-width="2" points="${points.map(p=>`${x(p.timestamp)},${y(p.close)}`).join(' ')}"/>`).join('')}<text x="30" y="20">${n(hi)}</text><text x="30" y="195">${time(start)}</text><text x="610" y="195" text-anchor="end">${time(end)}</text></svg></section>`;
  }).join(''));
 }catch(error){return card('指數分時快照',`<p role="status">尚無可用快照：${e(error.message)}</p><p>請更新市場資料後重試。</p><button data-action="reload">更新分時快照</button>`);}
}
