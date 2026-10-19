import {escapeHTML as e,number as n} from './core.mjs';

export const periodDefinitions={
 revenue:{path:'monthly',fields:[['value','月營收（千元）'],['yoy','年增率 %'],['mom','月增率 %']]},
 earnings:{path:'quarterly',fields:[['eps','來源期間 EPS（未拆單季）'],['bvps','每股淨值'],['gm','毛利率 %'],['om','營業利益率 %'],['nm','淨利率 %'],['roe','ROE %']]},
 dividends:{path:'dividends',fields:[['cash','現金股利（元／股）'],['stock','股票股利（元／股）']]}
};

export function periodRows(payload,kind){
 const definition=periodDefinitions[kind];
 if(!definition||!Array.isArray(payload?.data))throw new Error('來源歷史資料格式不符');
 return payload.data.flatMap((record,index)=>{
  const period=record?.period??record?.date;
  if(typeof period!=='string'||!period.trim())return [];
  const values=Object.fromEntries(definition.fields.map(([key])=>[key,typeof record[key]==='number'&&Number.isFinite(record[key])?record[key]:null]));
  return [{id:`${period}.${index}`,period,values,availability:typeof record.effective_available_at==='string'?record.effective_available_at:null}];
 }).sort((a,b)=>b.period.localeCompare(a.period));
}

export function periodTrend(rows,key,label,color='var(--blue)',limit=12){
 const points=rows.filter(row=>Number.isFinite(row.values[key])).slice(0,limit).reverse();
 if(!points.length)return '<p class="muted">來源尚無可繪製的有效資料。</p>';
 const values=points.map(row=>row.values[key]),lo=Math.min(0,...values),hi=Math.max(0,...values),span=hi-lo||1;
 const x=i=>48+(points.length===1?0:i/(points.length-1))*660,y=v=>178-(v-lo)/span*132;
 const path=points.map((row,i)=>`${i?'L':'M'} ${x(i).toFixed(1)} ${y(row.values[key]).toFixed(1)}`).join(' ');
 const ticks=[lo,lo+(hi-lo)/2,hi];
 return `<svg class="chart period-trend" viewBox="0 0 740 218" role="img" aria-label="${e(label)}，${e(points[0].period)} 至 ${e(points.at(-1).period)}，共 ${points.length} 期">${ticks.map(v=>`<line class="grid" x1="48" x2="708" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/><text x="42" y="${(y(v)-5).toFixed(1)}" text-anchor="end">${n(v,1)}</text>`).join('')}<path d="${path}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>${points.map((row,i)=>`<circle cx="${x(i).toFixed(1)}" cy="${y(row.values[key]).toFixed(1)}" r="3" fill="${color}"><title>${e(row.period)}・${e(label)} ${n(row.values[key])}</title></circle>`).join('')}<text x="48" y="207">${e(points[0].period)}</text><text x="708" y="207" text-anchor="end">${e(points.at(-1).period)}</text></svg>`;
}

export function dividendYearRows(rows){
 const grouped=new Map();
 for(const row of rows){
  const year=String(row.period).slice(0,4);if(!/^\d{4}$/.test(year))continue;
  const item=grouped.get(year)||{year,cash:[],stock:[]};
  if(Number.isFinite(row.values.cash))item.cash.push(row.values.cash);
  if(Number.isFinite(row.values.stock))item.stock.push(row.values.stock);
  grouped.set(year,item);
 }
 const years=[...grouped.keys()].sort();if(!years.length)return [];
 const latest=Number(years.at(-1));
 return years.filter(year=>Number(year)>=latest-4).map(year=>{const item=grouped.get(year);return {year,cash:item.cash.length?item.cash.reduce((a,b)=>a+b,0):null,stock:item.stock.length?item.stock.reduce((a,b)=>a+b,0):null,observations:item.cash.length+item.stock.length};});
}

export function dividendBars(rows){
 const years=dividendYearRows(rows),values=years.flatMap(row=>[row.cash,row.stock].filter(Number.isFinite));
 if(!values.length)return '<p class="muted">來源近五年尚無有效股利金額。</p>';
 const max=Math.max(...values)||1,barW=Math.min(42,500/Math.max(1,years.length*2)),groupW=660/Math.max(1,years.length);
 const bars=years.map((row,i)=>{const center=58+groupW*(i+.5),parts=[['現金',row.cash,'var(--blue)',center-barW-2],['股票',row.stock,'var(--cyan)',center+2]];return parts.map(([name,value,color,x])=>Number.isFinite(value)?`<rect x="${x.toFixed(1)}" y="${(160-value/max*112).toFixed(1)}" width="${barW.toFixed(1)}" height="${(value/max*112).toFixed(1)}" rx="2" fill="${color}"><title>${e(row.year)} ${name}股利 ${n(value)} 元／股</title></rect>`:'').join('')+`<text x="${center.toFixed(1)}" y="184" text-anchor="middle">${e(row.year)}</text>`;}).join('');
 return `<svg class="chart dividend-bars" viewBox="0 0 740 210" role="img" aria-label="最近五年來源除息年度現金與股票股利，每股金額">${[0,.5,1].map(f=>{const v=max*f,y=160-f*112;return `<line class="grid" x1="50" x2="710" y1="${y}" y2="${y}"/><text x="44" y="${y-4}" text-anchor="end">${n(v)}</text>`;}).join('')}${bars}</svg><div class="valuation-range-labels"><span><i style="--scenario-color:var(--blue)"></i>現金股利・元／股</span><span><i style="--scenario-color:var(--cyan)"></i>股票股利・元／股</span></div>`;
}

export async function periodHistory(ctx,kind,symbol,row){
 const definition=periodDefinitions[kind];if(!definition)return null;
 const payload=await ctx.publicData(`${definition.path}/${encodeURIComponent(symbol)}.json`),rows=periodRows(payload,kind);
 const intro=ctx.card(`${row.name} ${symbol}・${ctx.title(kind)}`,`<p class="source muted">來源：Public_Data / ${e(definition.path)}/${e(symbol)}.json</p>${kind==='earnings'?'<p class="muted">依來源報導期間列示，未把累計財報當成單季數值；不同期間 EPS 不直接加總。</p>':''}`);
 if(!rows.length)return intro+ctx.status('尚無可用紀錄','來源未提供此證券的有效歷史資料。');
 let graphs='';
 if(kind==='revenue')graphs=ctx.card('月營收・千元',periodTrend(rows,'value','月營收・千元'))+ctx.card('年增率趨勢・百分比',periodTrend(rows,'yoy','年增率・百分比','var(--red)'));
 if(kind==='earnings'){
  const metrics=['gm','om','nm','roe'];
  const latest=metrics.map(key=>{const label=definition.fields.find(([field])=>field===key)?.[1]??key;return ctx.metric(label,n(rows[0].values[key]));}).join('');
  const trends=metrics.map((key,index)=>{const label=definition.fields.find(([field])=>field===key)?.[1]??key;return `<div class="period-series"><span>${e(label)}</span>${periodTrend(rows,key,label,['var(--blue)','var(--red)','var(--green)','var(--purple)'][index],8)}</div>`;}).join('');
  graphs=ctx.card('來源期間 EPS・元',periodTrend(rows,'eps','來源期間 EPS・元'))+ctx.card('獲利能力指標・百分比',latest)+ctx.card('獲利能力趨勢',trends);
 }
 if(kind==='dividends'){
  const years=dividendYearRows(rows),cash=years.map(row=>row.cash).filter(Number.isFinite),stock=years.map(row=>row.stock).filter(Number.isFinite);
  graphs=ctx.card('近五年股利合計・元／股',ctx.metric('來源現金股利合計',cash.length?cash.reduce((a,b)=>a+b,0):null)+ctx.metric('來源股票股利合計',stock.length?stock.reduce((a,b)=>a+b,0):null)+'<p class="muted">除息年度依來源日期分組；缺少同期原始收盤價時，現金殖利率顯示資料不足。</p>')+ctx.card('年度股利・元／股',dividendBars(rows));
 }
 const rowMarkup=record=>`<div class="period-row" role="row"><strong role="rowheader">${e(record.period)}</strong>${definition.fields.map(([key,label])=>`<span role="cell" data-label="${e(label)}">${n(record.values[key])}</span>`).join('')}${record.availability?`<small class="source muted">來源可用日：${e(record.availability)}</small>`:''}</div>`;
 const visibleRows=rows.slice(0,12),olderRows=rows.slice(12),table=ctx.card('期間明細',`<div class="period-table" role="table" aria-label="${e(row.name)} ${e(symbol)} ${e(ctx.title(kind))}"><div class="period-row period-head" role="row"><strong role="columnheader">期間</strong>${definition.fields.map(([,label])=>`<strong role="columnheader">${e(label)}</strong>`).join('')}</div>${visibleRows.map(rowMarkup).join('')}</div>${olderRows.length?`<details class="period-history-older"><summary>較早資料・${olderRows.length} 期</summary><div class="period-table" role="table" aria-label="較早${e(ctx.title(kind))}明細">${olderRows.map(rowMarkup).join('')}</div></details>`:''}`);
 return intro+graphs+table;
}
