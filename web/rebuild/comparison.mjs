import {escapeHTML as e,number as n,loadRecentDailyChart,resolveListingStatus,taipeiDay} from './core.mjs';
import {aggregateChartRows} from './chart.mjs';
export function comparisonStockMarkup(symbol,label,favoriteButton=()=> ''){
 const code=String(symbol);
 const link=`<a href="#/security?symbol=${encodeURIComponent(code)}" aria-label="查看比較個股：${e(label)}">${e(label)}</a>`;
 const star=typeof favoriteButton==='function'?favoriteButton(code,label,`comparison-${code}`):'';
 return `${link} ${star}`;
}
export function mountComparison(host,chartHost,identity,ctx){
 let selected='',comparison=[],view=null,error='',busy=false,generation=0;
 const allowed=s=>resolveListingStatus(s,taipeiDay(),ctx.state.listing).eligible;
 let controlsKey = null;
 function render(){
  if(!host.isConnected)return;
  const nextKey=JSON.stringify([selected,busy,error]);
  if(controlsKey!==nextKey){
  controlsKey=nextKey;
  host.innerHTML=`<h3>同日起點 100 比較</h3><label>比較證券<select data-comparison ${busy?'disabled':''}><option value="">不比較</option>${ctx.state.rows.filter(r=>allowed(r.symbol)).map(r=>`<option value="${e(r.symbol)}" ${r.symbol===selected?'selected':''}>${e(r.name)} ${e(r.symbol)}</option>`).join('')}</select></label><p>沿用主圖期間與價格尺度，以共同起日收盤各自設為100；不是市價、含息報酬或投資組合績效。</p>${busy?'<p role="status">載入比較行情…</p>':''}${error?`<p role="status">${e(error)}</p><button data-compare-retry>重試</button>`:''}<div data-comparison-chart></div>`;
  }
  if(!selected||!comparison.length||!view||busy||error)return;
  const target=host.querySelector('[data-comparison-chart]');
  try{
   if(!allowed(selected))throw Error('比較證券上市資格已過期');
   const rows=aggregateChartRows(comparison,view.interval,view.adjusted),map=new Map(rows.map(r=>[r.date,r]));
   const common=view.visible.filter(r=>map.has(r.date)&&!r.gapBefore&&!map.get(r.date).gapBefore);if(!common.length)throw Error('此期間沒有共同有效日期');
   const base=common[0],otherBase=map.get(base.date).close,segments=[];let segment=[];
   for(const r of view.visible){if(r.date<base.date)continue;const compared=map.get(r.date);if(compared&&!r.gapBefore&&!compared.gapBefore){segment.push({date:r.date,a:r.close/base.close*100,b:compared.close/otherBase*100});}else if(segment.length){segments.push(segment);segment=[];}}
   if(segment.length)segments.push(segment);const points=segments.flat(),lo=Math.min(...points.flatMap(p=>[p.a,p.b])),hi=Math.max(...points.flatMap(p=>[p.a,p.b]));
   const dates=view.visible.map(r=>r.date),x=d=>30+dates.indexOf(d)/Math.max(1,dates.length-1)*580,y=v=>170-(v-lo)/(hi-lo||1)*140;
   const other=ctx.state.rows.find(r=>r.symbol===selected),label=`${other?.name||selected} ${selected}`;
   target.innerHTML=`<p>${e(identity)}（藍）／${comparisonStockMarkup(selected,label,ctx.favoriteButton)}（紫）・${view.adjusted?'還原':'原始'}・基準日 ${e(base.date)}</p><svg class="chart" viewBox="0 0 640 200" role="img" aria-label="${e(identity)} 與 ${e(label)} 同日起點100比較">${['a','b'].map((key,k)=>segments.map(rows=>rows.length===1?`<circle cx="${x(rows[0].date)}" cy="${y(rows[0][key])}" r="3" fill="${k?'var(--comparison-color)':'var(--blue)'}"/>`:`<polyline fill="none" stroke="${k?'var(--comparison-color)':'var(--blue)'}" stroke-width="2" points="${rows.map(p=>`${x(p.date)},${y(p[key])}`).join(' ')}"/>`).join('')).join('')}<text x="30" y="20">${n(hi)}</text><text x="30" y="195">${n(lo)}</text></svg><details><summary>比較數值</summary>${points.map(p=>`<p>${p.date}・${e(identity)} ${n(p.a)}／<a href="#/security?symbol=${encodeURIComponent(selected)}" aria-label="查看比較個股：${e(label)}">${e(label)}</a> ${n(p.b)}</p>`).join('')}</details>`;
  }catch(x){target.textContent=x.message;}
 }
 async function load(){const token=++generation;comparison=[];error='';if(!selected){busy=false;render();return;}busy=true;render();try{if(!allowed(selected))throw Error('上市資格尚未確認');comparison=(await loadRecentDailyChart(selected,ctx.state.index,ctx.publicData)).rows;if(token!==generation)return;}catch(x){if(token===generation)error=x.message;}finally{if(token===generation){busy=false;render();}}}
 host.style.setProperty('--comparison-color','#a855f7');
 host.addEventListener('change',event=>{if(event.target.matches('[data-comparison]')){selected=event.target.value;load();}});
 host.addEventListener('click',event=>{if(event.target.closest('[data-compare-retry]'))load();});
 chartHost.addEventListener('chart-range-change',event=>{view=event.detail;render();});render();
}
