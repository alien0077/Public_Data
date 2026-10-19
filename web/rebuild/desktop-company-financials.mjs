import {escapeHTML as e,number as n} from './core.mjs';

const metricFields=[
 ['eps','來源期間 EPS（元）'],['gm','毛利率（%）'],['om','營業利益率（%）'],
 ['nm','淨利率（%）'],['roe','ROE（%）'],['bvps','每股淨值（元）']
];

function monthlyRevenueChart(rows,name,symbol){
 const points=rows.slice(0,12).reverse();
 if(!points.length||!points.some(row=>Number.isFinite(row.value)))return '<p class="muted">來源尚無可繪製的月營收資料。</p>';
 const revenues=points.map(row=>row.value).filter(value=>Number.isFinite(value)&&value>=0),maxRevenue=Math.max(1,...revenues),
   yoyValues=points.map(row=>row.yoy).filter(Number.isFinite),minYoy=Math.min(0,...yoyValues),maxYoy=Math.max(0,...yoyValues),yoySpan=maxYoy-minYoy||1,
   x=index=>64+(index+.5)*640/points.length,barWidth=Math.min(32,640/points.length*.52),
   yRevenue=value=>176-(value/maxRevenue)*126,yYoy=value=>154-(value-minYoy)/yoySpan*88;
 const bars=points.map((row,index)=>Number.isFinite(row.value)&&row.value>=0?`<rect x="${(x(index)-barWidth/2).toFixed(1)}" y="${yRevenue(row.value).toFixed(1)}" width="${barWidth.toFixed(1)}" height="${(176-yRevenue(row.value)).toFixed(1)}" rx="2" fill="var(--blue)"><title>${e(row.period)}・月營收 ${n(row.value/100000,2)} 億元</title></rect>`:'').join('');
 const lineSegments=[];let segment=[];
 points.forEach((row,index)=>{if(!Number.isFinite(row.yoy)){if(segment.length)lineSegments.push(segment);segment=[];}else segment.push({index,value:row.yoy});});if(segment.length)lineSegments.push(segment);
 const line=lineSegments.map(items=>items.length===1?`<circle cx="${x(items[0].index).toFixed(1)}" cy="${yYoy(items[0].value).toFixed(1)}" r="3" fill="var(--orange)"><title>${e(points[items[0].index].period)}・年增率 ${n(items[0].value)}%</title></circle>`:`<polyline points="${items.map(point=>`${x(point.index).toFixed(1)},${yYoy(point.value).toFixed(1)}`).join(' ')}" fill="none" stroke="var(--orange)" stroke-width="2"/>`).join('');
 const labels=points.map((row,index)=>index===0||index===points.length-1||index%3===0?`<text x="${x(index).toFixed(1)}" y="202" text-anchor="middle">${e(row.period)}</text>`:'').join('');
 return `<svg class="chart desktop-revenue-chart" viewBox="0 0 760 220" role="img" aria-label="${e(name)} ${e(symbol)} 最近${points.length}期月營收與年增率來源圖；營收單位億元，年增率百分比"><line class="grid" x1="44" x2="716" y1="176" y2="176"/><text x="42" y="18" text-anchor="end">${n(maxRevenue/100000,1)} 億</text>${bars}${line}${labels}</svg><div class="desktop-financial-legend"><span><i class="revenue-key"></i>月營收（億元）</span><span><i class="yoy-key"></i>年增率（%）</span></div><p class="muted">來源：Public_Data 月營收；營收依來源千元換算億元，年增率使用來源值。日期與缺值依來源保留。</p>`;
}

function quarterlyTable(rows,name,symbol){
 const quarters=rows.slice(0,3),periods=quarters.map(row=>`<th scope="col">${e(row.period)}</th>`).join('');
 if(!quarters.length)return '<p class="muted">來源尚無可用季度財務資料。</p>';
 return `<div class="desktop-quarterly-scroll"><table class="desktop-quarterly-table" aria-label="${e(name)} ${e(symbol)} 最新來源季度財務資料"><thead><tr><th scope="col">財務指標</th>${periods}</tr></thead><tbody>${metricFields.map(([key,label])=>`<tr><th scope="row">${e(label)}</th>${quarters.map(row=>`<td>${Number.isFinite(row[key])?n(row[key]):'資料不足'}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="muted">保留來源報導期間；來源未提供欄位顯示資料不足，不把累計 EPS 重新標示為單季值。</p>`;
}

export async function desktopCompanyFinancials(ctx,symbol,row){
 const [monthly,quarterly]=await Promise.all([
  ctx.publicData(`monthly/${encodeURIComponent(symbol)}.json`),
  ctx.publicData(`quarterly/${encodeURIComponent(symbol)}.json`)
 ]);
 if(monthly?.stock_id!==symbol)throw Error('月營收來源代號與所選證券不符');
 const validRows=(payload,keys)=>Array.isArray(payload?.data)?payload.data.filter(item=>typeof item?.period==='string'&&keys.some(key=>Number.isFinite(item[key]))).sort((a,b)=>b.period.localeCompare(a.period)):[];
 const revenueRows=validRows(monthly,['value','yoy']),quarterRows=validRows(quarterly,metricFields.map(([key])=>key));
 const name=row.name||symbol;
 const revenuePanel=ctx.card('營收表現',monthlyRevenueChart(revenueRows,name,symbol));
 const earningsPanel=ctx.card('獲利能力・來源季度指標',quarterlyTable(quarterRows,name,symbol));
 return `<section class="desktop-company-financials" aria-label="${e(name)} ${e(symbol)} 財務摘要">${revenuePanel}${earningsPanel}</section>`;
}
