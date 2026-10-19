import {escapeHTML as e,number as n,resolveListingStatus,taipeiDay} from './core.mjs';

// daily_tw_job writes f/it/d and mb/ms in lots, not shares.
const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
export function readFlowDay(payload,symbol,date){
 if(payload?.date!==date||!Array.isArray(payload.stocks))throw Error('每日資料日期或格式不符');
 const matches=payload.stocks.filter(r=>String(r.id)===symbol);
 if(matches.length>1)throw Error('每日資料含重複股票');
 if(!matches.length)return null;
 const row=matches[0],value=k=>typeof row[k]==='number'&&Number.isFinite(row[k])?row[k]:null;
 if(row.date&&row.date!==date)throw Error('股票資料日期不符');
 return {date,foreign:value('f'),trust:value('it'),dealer:value('d'),margin:value('mb'),short:value('ms')};
}

export function institutionalFlowChart(sourceRows,name,symbol){
 const rows=[...sourceRows].slice(0,30).reverse();if(!rows.length)return '';
 const keys=[['foreign','外資'],['trust','投信'],['dealer','自營商']],values=rows.flatMap(row=>keys.map(([key])=>row[key]).filter(Number.isFinite));
 if(!values.length)return '<p class="muted">所選期間沒有有效法人買賣超值。</p>';
 const max=Math.max(1,...values.map(Math.abs)),group=660/rows.length,w=Math.min(7,group*.23),y0=103;
 const labelEvery=Math.max(1,Math.ceil(rows.length/6));
 const bars=rows.map((row,i)=>{const center=56+group*(i+.5);return keys.map(([key,label],j)=>{const value=row[key];if(!Number.isFinite(value))return '';const height=Math.abs(value)/max*65,x=center+(j-1)*(w+2)-w/2,y=value>=0?y0-height:y0;return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(1,height).toFixed(1)}" fill="${value>=0?'var(--up)':'var(--down)'}"><title>${e(row.date)}・${e(label)} ${n(value)} 張</title></rect>`;}).join('')+(i%labelEvery===0||i===rows.length-1?`<text x="${center.toFixed(1)}" y="190" text-anchor="middle">${e(row.date.slice(5))}</text>`:'');}).join('');
 return `<svg class="chart flow-bars" viewBox="0 0 740 210" role="img" aria-label="${e(name)} ${e(symbol)} 最近 ${rows.length} 日三大法人買賣超，單位張"><line class="grid" x1="48" x2="708" y1="${y0}" y2="${y0}"/><text x="48" y="20">最大絕對值 ${n(max)} 張</text>${bars}</svg><p class="muted">紅色正值、綠色負值；日期缺值不以零補入。</p>`;
}

export function marginBalanceChart(sourceRows,name,symbol){
 const rows=[...sourceRows].slice(0,30).reverse();if(!rows.length)return '';
 const keys=[['margin','融資餘額（張）','var(--red)'],['short','融券餘額（張）','var(--blue)']],values=rows.flatMap(row=>keys.map(([key])=>row[key]).filter(Number.isFinite));
 if(!values.length)return '<p class="muted">所選期間沒有有效融資融券餘額。</p>';
 const lo=Math.min(...values),hi=Math.max(...values),span=hi-lo||1,x=i=>56+(rows.length===1?0:i/(rows.length-1))*650,y=v=>162-(v-lo)/span*118;
 const paths=keys.map(([key,label,color])=>{let active=false;const path=rows.map((row,i)=>{const value=row[key];if(!Number.isFinite(value)){active=false;return '';}const command=`${active?'L':'M'} ${x(i).toFixed(1)} ${y(value).toFixed(1)}`;active=true;return command;}).filter(Boolean).join(' ');return path?`<path d="${path}" fill="none" stroke="${color}" stroke-width="2.5"><title>${e(label)}</title></path>`:'';}).join('');
 return `<svg class="chart margin-lines" viewBox="0 0 740 210" role="img" aria-label="${e(name)} ${e(symbol)} 最近 ${rows.length} 日融資融券餘額趨勢，單位張">${[lo,(lo+hi)/2,hi].map(v=>`<line class="grid" x1="52" x2="710" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/><text x="48" y="${(y(v)-5).toFixed(1)}" text-anchor="end">${n(v,0)}</text>`).join('')}${paths}<text x="56" y="190">${e(rows[0].date)}</text><text x="706" y="190" text-anchor="end">${e(rows.at(-1).date)}</text></svg><div class="flow-legend"><span><i style="--flow-color:var(--red)"></i>融資餘額・張</span><span><i style="--flow-color:var(--blue)"></i>融券餘額・張</span></div><p class="muted">來源只提供餘額時，不推算每日增減量。</p>`;
}

export function createFlowHistory(ctx){
 const {state,publicData,card,metric,status}=ctx;
 let active=null,from='',to='';
 const allowed=s=>resolveListingStatus(s,taipeiDay(),state.listing).eligible;
 async function load(symbol){
  if(!allowed(symbol))throw Error('上市資格尚未確認');
  const dates=[...new Set((state.index.available_days_tw||[]).filter(d=>validDate(d)&&d<=taipeiDay()))].sort().slice(-60);
  const rows=[],failed=[],absent=[];let cursor=0;
  async function worker(){while(cursor<dates.length){
   const date=dates[cursor++];if(!allowed(symbol))throw Error('上市資格已過期');
   try{const row=readFlowDay(await publicData(`daily/tw/${date}.json`),symbol,date);if(row)rows.push(row);else absent.push(date);}catch(error){failed.push({date,message:error.message});}
  }}
  await Promise.all(Array.from({length:Math.min(3,dates.length)},worker));
  if(!allowed(symbol))throw Error('上市資格已過期');
  return {symbol,dates,rows:rows.sort((a,b)=>b.date.localeCompare(a.date)),failed:failed.sort((a,b)=>a.date.localeCompare(b.date)),absent:absent.sort()};
 }
 async function page(id,symbol,row){
  if(!allowed(symbol))return status('上市資格尚未確認','請先同步目前上市資料。');
  const [summary,history]=await Promise.allSettled([publicData(`stocks/${encodeURIComponent(symbol)}.json`),load(symbol)]);
  if(!allowed(symbol))return status('上市資格已過期','請重新同步資料。');
  let html=card(`${row.name||symbol} ${symbol}・${id==='flows'?'法人籌碼':'融資融券'}`,`<p>Public_Data 每日資料，最近60個來源交易日；缺值顯示資料不足。</p>`);
  if(summary.status==='fulfilled'){
   const d=summary.value,values=id==='flows'?{'資料日期':d.date,'外資連買天數':d.institutional?.foreign_buy_days,'投信連買天數':d.institutional?.trust_buy_days,'自營商連買天數':d.institutional?.dealer_buy_days}:{'資料日期':d.source_dates?.margin,'來源融資變化':d.margin?.margin_change,'來源融券變化':d.margin?.short_change,'維持率 %':d.margin?.maintenance_ratio};
   html+=card('來源摘要',`<div class="metric-grid">${Object.entries(values).map(([label,value])=>metric(label,typeof value==='number'?n(value):e(value??'資料不足'))).join('')}</div><p class="muted">摘要與逐日紀錄各自保留來源日期。摘要未提供變化單位時不推定為張數。</p>`);
  }else html+=status('摘要暫不可用',summary.reason.message);
  if(history.status==='rejected')return html+status('逐日資料載入失敗',history.reason.message,'↗',true);
  active={...history.value,id,name:row.name||symbol};
  return html+renderHistory();
 }
 function renderHistory(){
  if(!active)return '';
  if(!allowed(active.symbol))return '<div id="flow-history-content">'+status('上市資格已過期','請重新同步資料。')+'</div>';
  const {symbol,name,dates,failed,absent,id}=active;
  const fields=id==='flows'?[['foreign','外資買賣超（張）'],['trust','投信買賣超（張）'],['dealer','自營商買賣超（張）']]:[['margin','融資餘額（張）'],['short','融券餘額（張）']];
  const rows=active.rows.filter(r=>(!from||r.date>=from)&&(!to||r.date<=to));
  const controls=card('逐日紀錄',`<form id="flow-period" class="toolbar"><label>起日<input type="date" name="from" value="${e(from)}"></label><label>迄日<input type="date" name="to" value="${e(to)}"></label><button>套用期間</button><button type="button" data-flow-reset>全部期間</button></form><p>${e(dates[0]??'沒有來源日期')} ～ ${e(dates.at(-1)??'沒有來源日期')}・取得 ${active.rows.length} 日</p><p id="flow-period-error" role="alert"></p>`);
  const gaps=failed.length||absent.length?card('資料覆蓋',`<p>載入失敗 ${failed.length} 日；來源未列此證券 ${absent.length} 日。這些日期未當作零。</p><details><summary>查看日期</summary>${failed.map(x=>`<p>${e(x.date)}：${e(x.message)}</p>`).join('')}${absent.map(d=>`<p>${e(d)}：來源未列此證券</p>`).join('')}</details><button data-flow-reload>重新載入</button>`):'';
  const chart=card(id==='flows'?'三大法人買賣超・張':'融資融券餘額趨勢・張',id==='flows'?institutionalFlowChart(rows,name,symbol):marginBalanceChart(rows,name,symbol));
  const records=rows.length?rows.map(r=>card(r.date,`<p>${e(name)} ${e(symbol)}</p><div class="metric-grid">${fields.map(([key,label])=>metric(label,r[key]===null?'資料不足':n(r[key]))).join('')}</div>`)).join(''):status('所選期間尚無逐日資料','可調整期間或重新同步資料。');
  return `<div id="flow-history-content">${controls}${gaps}${rows.length?chart:''}${records}</div>`;
 }
 function listen(host){
  host.addEventListener('submit',ev=>{if(ev.target.id!=='flow-period')return;ev.preventDefault();const values=new FormData(ev.target),start=String(values.get('from')||''),end=String(values.get('to')||'');if(start&&end&&start>end){host.querySelector('#flow-period-error').textContent='起日不可晚於迄日';return;}from=start;to=end;host.querySelector('#flow-history-content').outerHTML=renderHistory();});
  host.addEventListener('click',async ev=>{if(ev.target.closest('[data-flow-reset]')){from='';to='';host.querySelector('#flow-history-content').outerHTML=renderHistory();}if(ev.target.closest('[data-flow-reload]'))await ctx.refresh();});
 }
 return {page,listen};
}
