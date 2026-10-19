import {escapeHTML as esc,number as fmt,exchangeDateLabel,exchangeClockMarkup} from './core.mjs';

// Same contract as KLineCandle.rsi: source-provided technical_daily.rsi14.
// Never infer RSI from raw prices: native indicators may use adjusted inputs.
export function sourceRSI(row) {
  const value=row.rsi14 ?? row.rsi;
  return typeof value==='number' && Number.isFinite(value) && value>=0 && value<=100 ? value : null;
}
export function chartMarket(options={}) {
  return ['US','NASDAQ','NYSE','AMEX'].includes(String(options.market??'').toUpperCase())||options.symbol==='TSM'||String(options.symbol??'').startsWith('^')?'US':'TW';
}
export function rsiSegments(rows) {
  const segments=[];let segment=[];
  rows.forEach((row,index)=>{const value=sourceRSI(row);if(row.gapBefore||value===null){if(segment.length)segments.push(segment);segment=[];}if(value!==null)segment.push({index,value,date:row.date});});
  if(segment.length)segments.push(segment);
  return segments;
}
function finiteSegments(points) {
 const result=[];let segment=[];
 for(const point of points){if(!Number.isFinite(point.v)){if(segment.length)result.push(segment);segment=[];}else segment.push(point);}
 if(segment.length)result.push(segment);return result;
}
export function desktopVolumePanel(rows,identity){
 const values=rows.map(row=>Number.isFinite(row.volume)&&row.volume>0?row.volume:null),maximum=Math.max(1,...values.filter(Number.isFinite)),width=684/Math.max(rows.length,1),
  bars=rows.map((row,index)=>{const volume=values[index];if(!Number.isFinite(volume))return '';const height=volume/maximum*90,color=row.close>row.open?'var(--up)':row.close<row.open?'var(--down)':'var(--muted)';return `<rect x="${(38+(index+.5)*width-width*.3).toFixed(1)}" y="${(110-height).toFixed(1)}" width="${Math.max(width*.6,1).toFixed(1)}" height="${height.toFixed(1)}" fill="${color}"><title>${esc(row.date)}・成交量 ${fmt(volume,0)} 股</title></rect>`;}).join('');
 return `<section class="desktop-chart-volume" aria-label="${esc(identity)} 成交量圖"><svg viewBox="0 0 760 130" role="img" aria-label="${esc(identity)} 成交量，獨立尺度；缺值不補零"><line x1="38" x2="722" y1="110" y2="110" stroke="var(--line)"/>${bars}<text x="38" y="14">${fmt(maximum,0)} 股</text></svg><small>成交量・獨立尺度</small></section>`;
}
// Aggregate after price-basis transformation so corporate-action boundaries do not
// apply the final day's adjustment factor to an entire week/month.
export function aggregateChartRows(rows,interval='day',adjusted=false){
 if(!['day','week','month'].includes(interval))throw Error('K 線週期不支援');
 const daily=rows.map(r=>{if(!adjusted)return {...r};if(!Number.isFinite(r.adj_close)||r.adj_close<=0||!(r.close>0))throw Error('還原價資料不足');const ratio=r.adj_close/r.close;return {...r,open:r.open*ratio,high:r.high*ratio,low:r.low*ratio,close:r.adj_close};});
 if(interval==='day')return daily;
 const groups=new Map();for(const r of daily){const d=new Date(r.date+'T00:00:00Z');if(!Number.isFinite(d.getTime()))throw Error('K 線日期無效');if(interval==='week')d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);const key=interval==='month'?r.date.slice(0,7):d.toISOString().slice(0,10),prior=groups.get(key);
  if(prior&&r.gapBefore){groups.set(key,{date:r.date,firstDate:r.date,open:r.open,high:r.high,low:r.low,close:r.close,volume:r.volume,rsi14:null,rsi:null,sessions:1,gapBefore:true,foreign_net:r.foreign_net,trust_net:r.trust_net,dealer_net:r.dealer_net});}
  else if(prior){prior.high=Math.max(prior.high,r.high);prior.low=Math.min(prior.low,r.low);prior.close=r.close;prior.volume+=r.volume;prior.date=r.date;prior.sessions++;for(const field of ['foreign_net','trust_net','dealer_net'])prior[field]=Number.isFinite(prior[field])&&Number.isFinite(r[field])?(Number.isFinite(prior[field]+r[field])?prior[field]+r[field]:null):null;}
  else groups.set(key,{date:r.date,firstDate:r.date,open:r.open,high:r.high,low:r.low,close:r.close,volume:r.volume,rsi14:null,rsi:null,sessions:1,gapBefore:!!r.gapBefore,foreign_net:r.foreign_net,trust_net:r.trust_net,dealer_net:r.dealer_net});
 }
 const result=[...groups.values()];if(result.some(r=>![r.open,r.high,r.low,r.close,r.volume].every(Number.isFinite)))throw Error('合併行情數值超出範圍');return result;
}
export function chartIndicators(rows){
 const closes=rows.map(r=>r.close),segments=[];let segment=-1;rows.forEach((r,i)=>{if(i===0||r.gapBefore)segment++;segments[i]=segment;});
 const ema=(values,period)=>{const out=values.map(()=>null);let seed=[],value=null,lastSegment=-1;for(let i=0;i<values.length;i++){const x=values[i];if(segments[i]!==lastSegment){seed=[];value=null;lastSegment=segments[i];}if(!Number.isFinite(x)){seed=[];value=null;continue;}if(value===null){seed.push(x);if(seed.length===period)value=seed.reduce((a,b)=>a+b,0)/period;}else value+=2/(period+1)*(x-value);if(Number.isFinite(value))out[i]=value;}return out;};
 const averages=Object.fromEntries([5,20,60].map(period=>[period,closes.map((_,i)=>i+1<period||segments[i+1-period]!==segments[i]?null:closes.slice(i+1-period,i+1).reduce((a,b)=>a+b,0)/period)]));
 const fast=ema(closes,12),slow=ema(closes,26),dif=closes.map((_,i)=>fast[i]===null||slow[i]===null?null:fast[i]-slow[i]),signal=ema(dif,9);
 const k=rows.map(()=>null),d=rows.map(()=>null);
 for(let i=0;i<rows.length;i++){
  if(i<8||segments[i-8]!==segments[i])continue;
  const recent=rows.slice(i-8,i+1),high=Math.max(...recent.map(r=>r.high)),low=Math.min(...recent.map(r=>r.low));
  const rsv=high===low?100:(rows[i].close-low)/(high-low)*100;
  k[i]=!Number.isFinite(k[i-1])?rsv:(k[i-1]*2+rsv)/3;d[i]=!Number.isFinite(d[i-1])?k[i]:(d[i-1]*2+k[i])/3;
 }
 return {averages,dif,signal,k,d,histogram:dif.map((d,i)=>d===null||signal[i]===null?null:2*(d-signal[i]))};
}
export function mountChart(host,rows,identity,companion=null,options={}){
  const desktopOverview=options.desktopOverview===true;
  const market=chartMarket(options);
  const marketLabel=market==='US'?'美東交易所當地日期':'台灣交易所當地日期';
  const chartRanges={'1m':20,'3m':60,'6m':120,'1y':250,all:rows.length};
  let savedCount=120,savedPane='volume';try{const range=localStorage.getItem('rebuild.chart.default-range.v1')??'6m';savedCount=chartRanges[range]??120;const panes={'成交量':'volume','RSI':'rsi','MACD':'macd','KD':'kd','法人':'flow'};savedPane=panes[localStorage.getItem('rebuild.chart.default-indicator.v1')]??'volume';}catch{}
  let count=Math.min(savedCount,rows.length),end=rows.length,focus=rows.length-1,pane=desktopOverview?'macd':savedPane,flowField='foreign_net',adjusted=false,interval='day',showMA=true;
  let interaction='inspect',expanded=false,dialog=null,marker=null,queued=false;
  let updateFocus=()=>{},view=null,gesture=null;
  const pointers=new Map(),computed=new Map();
  const rawRows=rows;const canAdjust=rows.length>0&&rows.every(r=>Number.isFinite(r.adj_close)&&r.adj_close>0&&r.close>0);
  const basis=()=>adjusted?'還原':'原始';
  host.classList.add('chart-shell');
  const clampCount=value=>Math.max(Math.min(10,rows.length),Math.min(rows.length,Math.round(value)));
  function schedule(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;if(host.isConnected)render();});}
  function toggleExpanded(){
    if(expanded){dialog.close();return;}
    const origin=document.activeElement,controller=new AbortController();
    marker=document.createComment('chart-position');host.before(marker);
    dialog=document.createElement('dialog');dialog.className='expanded-chart';dialog.setAttribute('aria-label',identity+' 擴展圖表');
    document.body.append(dialog);dialog.append(host);if(companion)dialog.append(companion);expanded=true;
    dialog.addEventListener('close',()=>{controller.abort();expanded=false;marker.replaceWith(host);if(companion)host.after(companion);dialog.remove();dialog=null;marker=null;render();if(origin?.isConnected)origin.focus();else host.querySelector('[data-expand]')?.focus();},{once:true});
    window.addEventListener('hashchange',()=>dialog?.close(),{signal:controller.signal});
    render();dialog.showModal();host.querySelector('[data-expand]').focus();
  }
  host.onpointerdown=event=>{
    if(!event.target.closest('[data-price]'))return;
    host.setPointerCapture(event.pointerId);pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if(interaction==='inspect'){updateFocus(event.clientX);return;}
    event.preventDefault();const positions=[...pointers.values()];
    gesture=positions.length>=2?{kind:'pinch',distance:Math.hypot(positions[0].x-positions[1].x,positions[0].y-positions[1].y),count,end}:{kind:'pan',x:event.clientX,count,end};
  };
  host.onpointermove=event=>{
    if(!pointers.has(event.pointerId)){if(event.target.closest('[data-price]')&&event.pointerType==='mouse')updateFocus(event.clientX);return;}
    pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if(interaction==='inspect'){updateFocus(event.clientX);return;}
    if(!gesture||!view)return;event.preventDefault();
    if(gesture.kind==='pinch'&&pointers.size>=2){const p=[...pointers.values()],distance=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);if(distance>0&&gesture.distance>0)count=clampCount(gesture.count*gesture.distance/distance);}
    else if(gesture.kind==='pan'){end=Math.max(Math.min(count,rows.length),Math.min(rows.length,gesture.end-Math.round((event.clientX-gesture.x)/view.width*gesture.count)));focus=end-1;}
    schedule();
  };
  const release=event=>{pointers.delete(event.pointerId);if(host.hasPointerCapture(event.pointerId))host.releasePointerCapture(event.pointerId);gesture=null;};
  host.onpointerup=release;host.onpointercancel=release;
  function render(){
    const key=interval+':'+adjusted;
    if(!computed.has(key)){const data=aggregateChartRows(rawRows,interval,adjusted);computed.set(key,{rows:data,indicators:chartIndicators(data)});}
    const snapshot=computed.get(key);rows=snapshot.rows;end=Math.max(Math.min(count,rows.length),Math.min(end,rows.length));
    const indicators=snapshot.indicators;
    const start=Math.max(0,end-count),visible=rows.slice(start,end);
    host.dispatchEvent(new CustomEvent('chart-range-change',{detail:{visible,interval,adjusted}}));
    if(!visible.length){host.innerHTML='<div class="empty">尚無可用 K 線資料</div>';return;}
    focus=Math.max(start,Math.min(end-1,focus));
    const bounds=visible.flatMap(r=>[r.low,r.high]);if(showMA)for(const period of [5,20,60])bounds.push(...indicators.averages[period].slice(start,end).filter(Number.isFinite));
    const w=760,p=38,plot=684,min=Math.min(...bounds),max=Math.max(...bounds),span=max-min||1,dx=plot/visible.length;
    const x=i=>p+(i+.5)*dx,y=v=>p+(max-v)/span*190;
    const candle=visible.map((r,i)=>{const c=r.close>r.open?'var(--up)':r.close<r.open?'var(--down)':'var(--muted)';return `<g><line x1="${x(i)}" x2="${x(i)}" y1="${y(r.high)}" y2="${y(r.low)}" stroke="${c}"/><rect x="${x(i)-dx*.3}" y="${y(Math.max(r.open,r.close))}" width="${Math.max(dx*.6,1)}" height="${Math.max(Math.abs(y(r.open)-y(r.close)),1)}" fill="${c}"/></g>`;}).join('');
    const ma=showMA?[5,20,60].map((period,j)=>finiteSegments(visible.map((_,i)=>({i,v:indicators.averages[period][start+i]}))).map(points=>points.length===1?`<circle cx="${x(points[0].i)}" cy="${y(points[0].v)}" r="2" fill="${['#b45309','#2563eb','#9333ea'][j]}"/>`:`<polyline points="${points.map(pt=>`${x(pt.i)},${y(pt.v)}`).join(' ')}" fill="none" stroke="${['#b45309','#2563eb','#9333ea'][j]}" stroke-width="1.5"/>`).join('')).join(''):'';
    const dates=`<text x="38" y="258">${esc(visible[0].date)}</text><text x="722" y="258" text-anchor="end">${esc(visible.at(-1).date)}</text>`;
    const volumePanel=desktopOverview?desktopVolumePanel(visible,identity):'',periodControls=[['day','日 K'],['week','週 K'],['month','月 K']].map(([v,label])=>`<button data-interval="${v}" aria-pressed="${interval===v}" class="${interval===v?'primary':''}">${label}</button>`).join('')+(desktopOverview?'<a class="button-link" href="#desktop-intraday-chart">盤中分時</a>':'');
    host.innerHTML=`<div class="toolbar" role="group" aria-label="K 線週期">${periodControls}</div>${desktopOverview?'<p class="state" role="status">上方主圖採 canonical 原始日線；盤中 K 線位於下方 Fugle 分時區段，未設定金鑰時不載入。</p>':''}<div class="toolbar">${rows.length<20?`<span role="status">目前 ${rows.length} 筆；更多期間資料不足</span>`:[20,60,120,250].map(n=>`<button data-period="${n}" aria-label="${n>rows.length?`${n} 筆，目前僅有 ${rows.length} 筆 raw 行情`: `${n} 筆`}" aria-pressed="${count===n}" ${n>rows.length?'disabled':''} ${count===n?'class="primary"':''}>${n} 筆</button>`).join('')}<button data-adjust aria-pressed="${adjusted}" ${canAdjust?'':'disabled'}>${adjusted?'還原價':'原始價'}</button><button data-ma aria-pressed="${showMA}">MA 5／20／60</button><button data-export>匯出資料</button><button data-expand>${expanded?'收合圖表':'擴展圖表'}</button><button data-interaction aria-pressed="${interaction==='navigate'}">${interaction==='navigate'?'縮放／移動':'查看數值'}</button></div><small>${esc(identity)} · ${basis()}價格 K 線</small>${exchangeClockMarkup(market)}<p class="source muted">${marketLabel}・圖上日期依來源交易日；日 K 未含盤中時刻。</p>${rawRows.some(r=>r.gapBefore)?'<p class="state" role="status">來源明列不合格 OHLCV 日期；缺口未補值，缺口後指標重新暖機，週／月 K 僅合併缺口後可用交易日。</p>':''}<svg data-price style="touch-action:${interaction==='navigate'?'none':'pan-y'}" viewBox="0 0 ${w} 270" role="img" tabindex="0" aria-label="${esc(identity)} K 線，可用方向鍵逐日查看，加減鍵縮放">${[0,.5,1].map(v=>`<line x1="38" x2="722" y1="${p+190*v}" y2="${p+190*v}" stroke="var(--line)"/><text x="38" y="${p+190*v-5}">${fmt(max-span*v)}</text>`).join('')}${candle}${ma}${dates}<g data-crosshair aria-hidden="true" stroke="var(--ink)" stroke-dasharray="4 3"><line data-crosshair-x y1="38" y2="228"/><line data-crosshair-y x1="38" x2="722" y1="38" y2="228"/></g></svg><div class="chart-summary" aria-live="polite"></div>${volumePanel}<div class="toolbar" role="group" aria-label="獨立指標">${desktopOverview?'':`<button data-pane="volume" aria-pressed="${pane==='volume'}" ${pane==='volume'?'class="primary"':''}>成交量</button>`}<button data-pane="rsi" aria-pressed="${pane==='rsi'}" class="${pane==='rsi'?'primary':''}">RSI</button><button data-pane="macd" aria-pressed="${pane==='macd'}" class="${pane==='macd'?'primary':''}">MACD</button><button data-pane="flows" aria-pressed="${pane==='flows'}" class="${pane==='flows'?'primary':''}">法人</button><button data-pane="kd" aria-pressed="${pane==='kd'}" class="${pane==='kd'?'primary':''}">KD</button></div><div data-indicator></div><small>週／月 K 依已取得交易日合併，首尾期間可能尚未完整。成交量與 RSI 使用獨立尺度；MA／MACD 使用目前價格尺度與 K 線週期；MA5 橙、MA20 藍、MA60 紫。RSI 僅顯示來源日指標，缺值不補零。</small><label>圖表時間範圍<input type="range" min="${Math.min(count,rows.length)}" max="${rows.length}" value="${end}" aria-label="移動圖表時間範圍"></label>`;
    host.insertAdjacentHTML('afterbegin',exchangeClockMarkup(market));
    const indicator=host.querySelector('[data-indicator]');
    if(pane==='volume'){
      const vmax=Math.max(...visible.map(r=>Number.isFinite(r.volume)?Math.max(0,r.volume):0),1);
      indicator.innerHTML=`<svg viewBox="0 0 760 130" role="img" aria-label="${esc(identity)} 成交量，獨立尺度">${visible.map((r,i)=>{const v=Number.isFinite(r.volume)?Math.max(0,r.volume):0;return `<rect x="${x(i)-dx*.3}" y="${110-v/vmax*90}" width="${Math.max(dx*.6,1)}" height="${v/vmax*90}" fill="${r.close>r.open?'var(--up)':r.close<r.open?'var(--down)':'var(--muted)'}"/>`;}).join('')}<text x="38" y="14">${fmt(vmax,0)} 股</text></svg>`;
    }else if(pane==='rsi'){
      const segments=rsiSegments(visible),total=segments.reduce((n,s)=>n+s.length,0),ry=v=>110-v;
      indicator.innerHTML=total?`<svg viewBox="0 0 760 140" role="img" aria-label="${esc(identity)} RSI 14，獨立尺度 0 至 100">${[0,30,70,100].map(v=>`<line x1="38" x2="722" y1="${ry(v)}" y2="${ry(v)}" stroke="var(--line)" stroke-dasharray="4 3"/><text x="8" y="${ry(v)+4}">${v}</text>`).join('')}${segments.map(s=>s.length===1?`<circle cx="${x(s[0].index)}" cy="${ry(s[0].value)}" r="3" fill="var(--blue)"/>`:`<polyline points="${s.map(pt=>`${x(pt.index)},${ry(pt.value)}`).join(' ')}" fill="none" stroke="var(--blue)" stroke-width="2"/>`).join('')}</svg><small>RSI 14 · ${total}／${visible.length} 筆來源資料${total<visible.length?'；缺值處保留斷線':''}</small>`:'<div class="state" role="status">RSI 資料不足：僅日 K 使用來源 RSI 14；週／月 K 不以最後一日 RSI 冒充期間指標。</div>';
    }
    if(pane==='flows'){
      const fields=[['foreign_net','外資'],['trust_net','投信'],['dealer_net','自營商']],label=fields.find(([key])=>key===flowField)[1];
      const values=visible.map(r=>r[flowField]).filter(Number.isFinite),maximum=Math.max(0,...values),minimum=Math.min(0,...values),span=maximum-minimum||1,fy=v=>110-(v-minimum)/span*90;
      indicator.innerHTML=`<label>法人類別<select data-flow-field>${fields.map(([key,name])=>`<option value="${key}" ${key===flowField?'selected':''}>${name}</option>`).join('')}</select></label>`+(values.length?`<svg viewBox="0 0 760 140" role="img" aria-label="${esc(identity)} ${label}買賣超，張，獨立尺度"><line x1="38" x2="722" y1="${fy(0)}" y2="${fy(0)}" stroke="var(--line)"/>${visible.map((r,i)=>Number.isFinite(r[flowField])?`<rect x="${x(i)-dx*.3}" y="${Math.min(fy(r[flowField]),fy(0))}" width="${Math.max(dx*.6,1)}" height="${Math.abs(fy(r[flowField])-fy(0))}" fill="${r[flowField]>=0?'var(--up)':'var(--down)'}"/>`:'').join('')}<text x="38" y="14">${fmt(maximum)} 張</text><text x="38" y="135">${fmt(minimum)} 張</text></svg>`:'<p role="status">法人資料不足。</p>')+`<p>來源每日買賣超，${values.length}／${visible.length} 個期間有值；週／月只在該期間已取得行情日的法人值皆齊全時合計。缺值不補零；首尾期間可能未完整。</p><details><summary>法人數值</summary>${visible.map(r=>`<p>${r.firstDate?r.firstDate+'～':''}${r.date}・${esc(identity)}・${label} ${Number.isFinite(r[flowField])?fmt(r[flowField])+' 張':'資料不足'}</p>`).join('')}</details>`;
      indicator.querySelector('[data-flow-field]').onchange=event=>{flowField=event.target.value;render();host.querySelector('[data-flow-field]')?.focus();};
    }
    if(pane==='macd'){
      const keys=['dif','signal','histogram'],values=keys.flatMap(key=>indicators[key].slice(start,end)).filter(Number.isFinite),maximum=Math.max(0,...values),minimum=Math.min(0,...values),span=maximum-minimum||1,my=v=>110-(v-minimum)/span*90;
      const lines=['dif','signal'].map((key,j)=>finiteSegments(visible.map((_,i)=>({i,v:indicators[key][start+i]}))).map(points=>points.length===1?`<circle cx="${x(points[0].i)}" cy="${my(points[0].v)}" r="3" fill="${j?'#9333ea':'#2563eb'}"/>`:`<polyline points="${points.map(pt=>`${x(pt.i)},${my(pt.v)}`).join(' ')}" fill="none" stroke="${j?'#9333ea':'#2563eb'}" stroke-width="2"/>`).join('')).join('');
      indicator.innerHTML=values.length?`<svg viewBox="0 0 760 140" role="img" aria-label="${esc(identity)} ${basis()}價格 MACD 12 26 9"><line x1="38" x2="722" y1="${my(0)}" y2="${my(0)}" stroke="var(--line)"/>${visible.map((_,i)=>{const v=indicators.histogram[start+i];return Number.isFinite(v)?`<rect x="${x(i)-dx*.3}" y="${Math.min(my(v),my(0))}" width="${Math.max(dx*.6,1)}" height="${Math.abs(my(v)-my(0))}" fill="${v>=0?'var(--up)':'var(--down)'}"/>`:'';}).join('')}${lines}<text x="38" y="14">${fmt(maximum)}</text><text x="38" y="135">${fmt(minimum)}</text></svg><small>${basis()}價格 MACD (12,26,9) · DIF 藍／訊號紫 · 柱狀＝2×(DIF−訊號)，EMA 以首 N 筆平均暖機。</small>`:'<div class="state">MACD 暖機資料不足；DIF 至少26筆，訊號至少34筆。</div>';
    }
    if(pane==='kd'){
      const ky=v=>115-v*.95;
      const lines=['k','d'].map((key,j)=>finiteSegments(visible.map((_,i)=>({i,v:indicators[key][start+i]}))).map(points=>points.length===1?`<circle cx="${x(points[0].i)}" cy="${ky(points[0].v)}" r="3" fill="${j?'var(--kd-d)':'var(--kd-k)'}"/>`:`<polyline points="${points.map(pt=>`${x(pt.i)},${ky(pt.v)}`).join(' ')}" fill="none" stroke="${j?'var(--kd-d)':'var(--kd-k)'}" stroke-width="2"/>`).join('')).join('');
      indicator.innerHTML=indicators.k.slice(start,end).some(Number.isFinite)?`<svg viewBox="0 0 760 145" role="img" aria-label="${esc(identity)} ${basis()}價格 KD 9 3 3"><g style="--kd-k:var(--blue);--kd-d:#a855f7">${[0,20,80,100].map(v=>`<line x1="38" x2="722" y1="${ky(v)}" y2="${ky(v)}" stroke="var(--line)" stroke-dasharray="3 3"/><text x="8" y="${ky(v)+4}">${v}</text>`).join('')}${lines}</g></svg><small>K 藍／D 紫・KD(9,3,3)，首筆採 RSV 暖機，9筆高低同價時 RSV=100；使用目前價格尺度及週期。</small>`:'<div class="state" role="status">KD 暖機資料不足，至少需要9筆行情。</div>';
    }
    const summary=host.querySelector('.chart-summary');
    const describe=()=>{const r=rows[focus],rsi=sourceRSI(r),cx=x(focus-start),cy=y(r.close),localDate=market==='US'?'美東交易日期':'台灣交易日期';host.querySelector('[data-crosshair-x]').setAttribute('x1',cx);host.querySelector('[data-crosshair-x]').setAttribute('x2',cx);host.querySelector('[data-crosshair-y]').setAttribute('y1',cy);host.querySelector('[data-crosshair-y]').setAttribute('y2',cy);summary.textContent=`${identity} ${localDate} ${r.firstDate?r.firstDate+'～':''}${r.date}　開 ${fmt(r.open)}　高 ${fmt(r.high)}　低 ${fmt(r.low)}　收 ${fmt(r.close)}　量 ${fmt(r.volume,0)} 股（${basis()}價格）${pane==='rsi'?`　RSI 14：${rsi===null?'資料不足':fmt(rsi)}`:''}${pane==='kd'?`　K：${fmt(indicators.k[focus])}　D：${fmt(indicators.d[focus])}`:''}`;};describe();
    host.querySelectorAll('[data-interval]').forEach(b=>b.onclick=()=>{interval=b.dataset.interval;end=rawRows.length;focus=end-1;render();});
    host.querySelector('[data-expand]').onclick=toggleExpanded;
    host.querySelector('[data-interaction]').onclick=()=>{interaction=interaction==='inspect'?'navigate':'inspect';gesture=null;pointers.clear();render();host.querySelector('[data-interaction]').focus();};
    host.querySelector('[data-ma]').onclick=()=>{showMA=!showMA;render();};
    host.querySelector('[data-adjust]').onclick=()=>{if(canAdjust){adjusted=!adjusted;render();}};
    host.querySelectorAll('[data-period]').forEach(b=>b.onclick=()=>{count=+b.dataset.period;render();});
    host.querySelectorAll('[data-pane]').forEach(b=>b.onclick=()=>{pane=b.dataset.pane;render();host.querySelector(`[data-pane="${pane}"]`).focus();});
    host.querySelector('input').oninput=e=>{end=+e.target.value;focus=end-1;render();};
    const svg=host.querySelector('[data-price]');
    view={width:svg.getBoundingClientRect().width*plot/w};
    updateFocus=clientX=>{const rect=svg.getBoundingClientRect(),vx=(clientX-rect.left)/rect.width*w;focus=start+Math.max(0,Math.min(visible.length-1,Math.floor((vx-p)/dx)));describe();};
    svg.onkeydown=e=>{if(['ArrowLeft','ArrowRight','+','-','Home','End','PageUp','PageDown'].includes(e.key)){
      e.preventDefault();let redraw=false;
      if(e.key==='ArrowLeft')focus=Math.max(0,focus-1);
      if(e.key==='ArrowRight')focus=Math.min(rows.length-1,focus+1);
      if(e.key==='Home'){end=Math.min(count,rows.length);focus=0;redraw=true;}
      if(e.key==='End'){end=rows.length;focus=end-1;redraw=true;}
      if(e.key==='PageUp'||e.key==='PageDown'){end=Math.max(Math.min(count,rows.length),Math.min(rows.length,end+(e.key==='PageUp'?-1:1)*Math.max(1,Math.floor(count/2))));focus=end-1;redraw=true;}
      if(e.key==='+'||e.key==='-'){count=clampCount(count+(e.key==='+'?-10:10));redraw=true;}
      if(focus<start){end=Math.min(rows.length,focus+count);redraw=true;}else if(focus>=end){end=focus+1;redraw=true;}
      if(redraw){render();host.querySelector('[data-price]').focus();}else describe();
    }};
    svg.onwheel=e=>{if(e.ctrlKey){e.preventDefault();count=Math.max(10,Math.min(rows.length,count+Math.sign(e.deltaY)*10));render();}};
    host.querySelector('[data-export]').onclick=()=>{
      const label=/^[=+@-]/.test(identity)?"'"+identity:identity,security='"'+label.replaceAll('"','""')+'"';
      const header='security,price_basis,interval,date,open,high,low,close,volume,rsi14,ma5,ma20,ma60,macd_dif,macd_signal,macd_histogram,k9,d9,foreign_net_lots,trust_net_lots,dealer_net_lots';
      const records=visible.map((r,i)=>[security,adjusted?'adjusted':'raw',interval,r.date,r.open,r.high,r.low,r.close,r.volume,sourceRSI(r)??'',... [5,20,60].map(period=>indicators.averages[period][start+i]??''),... ['dif','signal','histogram','k','d'].map(key=>indicators[key][start+i]??''),...['foreign_net','trust_net','dealer_net'].map(key=>r[key]??'')].join(','));
      const a=document.createElement('a'),url=URL.createObjectURL(new Blob([[header,...records].join('\n')],{type:'text/csv;charset=utf-8'}));
      a.href=url;a.download=(adjusted?'adjusted':'raw')+'-'+interval+'-price-chart.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    };
  }
  render();
}
