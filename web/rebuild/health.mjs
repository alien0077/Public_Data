import {escapeHTML as e,number as n} from './core.mjs';

export function renderHealth({card,facts},symbol,row,data,recent=null){
 const name=row?.name||symbol,components=data.score_components??{},dates=data.source_dates??{};
 const overview=facts({
  '證券':`${name} ${symbol}`,'報告日期':data.date,'訊號':data.signal,'健檢分數':data.health_score,
  '技術面':components.technical,'籌碼面':components.chip,'市場情緒':components.sentiment,
  '方法版本':data.method_version??data.data_version,'風險程度':data.risk_level
 });
 const freshness=data.freshness?.stale===true
  ?card('來源時效警示','<p role="status">來源資料已過期，健檢分數可能未反映最新行情；請先同步資料。</p>')
  :'';
 const sourceDates=facts({'行情':dates.price,'籌碼':dates.margin,'持股週資料':dates.weekly,'量化':dates.quant});
 const narrative=data.chip_warning??data.ai_narrative;
 const chart=recent?.rows?.length?(()=>{
  const points=recent.rows,values=points.map(x=>x.close),volumeMax=Math.max(1,...points.map(x=>x.volume)),lo=Math.min(...values),hi=Math.max(...values),span=Math.max(hi-lo,Math.max(1,hi*.02)),floor=lo-span*.12,ceiling=hi+span*.12,left=55,right=735,top=25,bottom=205,volTop=235,volBottom=292;
  const x=i=>left+(points.length<2?0:i*(right-left)/(points.length-1)),y=v=>bottom-(v-floor)/(ceiling-floor)*(bottom-top),barWidth=Math.max(2,Math.min(13,(right-left)/points.length*.56));
  const groups=[];for(let i=0;i<points.length;i++){if(!groups.length||points[i].gapBefore)groups.push([]);groups.at(-1).push(i);}
  const areas=groups.map(group=>{const first=group[0],last=group.at(-1),line=group.map((index,n)=>`${n?'L':'M'}${x(index).toFixed(1)},${y(points[index].close).toFixed(1)}`).join(' ');return `<path d="${line} L${x(last).toFixed(1)},${bottom} L${x(first).toFixed(1)},${bottom} Z" fill="var(--health-chart-fill)"/><path d="${line}" fill="none" stroke="var(--health-chart-line)" stroke-width="2.5"/>`;}).join('');
  const bars=points.map((p,i)=>`<rect x="${(x(i)-barWidth/2).toFixed(1)}" y="${(volBottom-p.volume/volumeMax*(volBottom-volTop)).toFixed(1)}" width="${barWidth.toFixed(1)}" height="${(p.volume/volumeMax*(volBottom-volTop)).toFixed(1)}" rx="1" fill="var(--health-volume)"/>`).join('');
  const missing=recent.missingDates?.length?`<p class="muted">缺少個股列的交易日：${e(recent.missingDates.join('、'))}；圖線已在缺口處斷開。</p>`:'';
  const color=points.at(-1).close>=points[0].close?'var(--up)':'var(--down)';
  return card(`${name} ${symbol}・股價趨勢（最近 1 月）`,`<div class="toolbar health-periods" role="group" aria-label="股價趨勢期間"><button type="button" class="selected" aria-pressed="true">1月</button>${['3月','6月','1年','3年'].map(label=>`<button type="button" disabled aria-label="${label}期間尚未載入">${label}</button>`).join('')}</div><p class="muted">Public_Data 原始 OHLCV・${points.length}/${recent.requestedDates.length} 個交易日・${e(points[0].date)} 至 ${e(points.at(-1).date)}；未使用 adj_close。</p><svg class="health-price-chart" viewBox="0 0 760 330" style="--health-chart-line:${color};--health-chart-fill:color-mix(in srgb,${color} 22%,transparent);--health-volume:var(--muted)" role="img" aria-label="${e(name)} ${symbol} 最近一個月原始收盤趨勢與成交量"><line class="grid" x1="${left}" x2="${right}" y1="${y(hi)}" y2="${y(hi)}"/><line class="grid" x1="${left}" x2="${right}" y1="${y(lo)}" y2="${y(lo)}"/><text x="4" y="${y(hi)+4}">${n(hi)}</text><text x="4" y="${y(lo)+4}">${n(lo)}</text>${areas}<line class="grid" x1="${left}" x2="${right}" y1="${volTop}" y2="${volTop}"/>${bars}<text x="${left}" y="323">${e(points[0].date)}</text><text x="${right-90}" y="323">${e(points.at(-1).date)}</text></svg><p class="muted">上方為原始收盤價，下方為原始成交量；較長期間尚未載入。</p>${missing}`);
 })():card(`${name} ${symbol}・股價趨勢`,'<p class="muted">最近一個月原始日行情尚未載入；不以還原價補圖。</p>');
 return card('個股健檢',overview+`<p class="muted">來源分析結果，不代表保證績效或投資建議。</p>`)
  +chart+freshness+card('來源日期',sourceDates)
  +card('資料觀察',narrative?`<p>${e(narrative)}</p>`:'<p class="muted">來源尚未提供摘要。</p>');
}
