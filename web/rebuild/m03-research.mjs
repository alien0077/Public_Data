import {escapeHTML as e,number as n,identity,resolveListingStatus,taipeiDay,compareCodepoints} from './core.mjs';

const SOURCES={foreign:{label:'外資',key:'f'},trust:{label:'投信',key:'it'},dealer:{label:'自營商',key:'d'}};
const DEFAULT_RULES={volumeLots:1000,returnPct:3,foreignLots:5000,price:50};

function readRules(){try{const value=JSON.parse(localStorage.getItem('rebuild.quick-filter.m03.v1')||'null');if(value&&Object.keys(DEFAULT_RULES).every(key=>Number.isFinite(value[key])&&value[key]>=0))return value;}catch{}return {...DEFAULT_RULES};}

function amountChart(points,label){
 if(!points.length)return '<p class="muted">所選期間沒有可驗證的法人金額資料。</p>';
 const values=points.map(point=>point.amount),max=Math.max(...values.map(Math.abs),1),left=64,right=660,zero=100,span=66,step=(right-left)/points.length,width=Math.max(2,step*.66);
 const bars=points.map((point,index)=>{const height=Math.abs(point.amount)/max*span,x=left+index*step+(step-width)/2,y=point.amount>=0?zero-height:zero;return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${width.toFixed(1)}" height="${Math.max(1,height).toFixed(1)}" fill="${point.amount>=0?'var(--up)':'var(--down)'}"><title>${e(point.date)} ${point.amount>=0?'淨買超':'淨賣超'} ${n(Math.abs(point.amount),1)} 億元</title></rect>`;}).join('');
 return `<svg class="m03-flow-chart" viewBox="0 0 700 190" role="img" aria-label="${e(label)}每日買賣超金額，單位億元"><line x1="${left}" x2="${right}" y1="${zero-span}" y2="${zero-span}" stroke="var(--line)"/><line x1="${left}" x2="${right}" y1="${zero}" y2="${zero}" stroke="var(--line)"/><line x1="${left}" x2="${right}" y1="${zero+span}" y2="${zero+span}" stroke="var(--line)"/><text x="56" y="${zero-span+4}" text-anchor="end">+${n(max,1)}</text><text x="56" y="${zero+4}" text-anchor="end">0</text><text x="56" y="${zero+span+4}" text-anchor="end">−${n(max,1)}</text><text x="${left}" y="183">${e(points[0].date.slice(5))}</text><text x="${right}" y="183" text-anchor="end">${e(points.at(-1).date.slice(5))}</text>${bars}</svg>`;
}

export function createM03Research(ctx){
 const {state,card,status,publicData,favoriteButton=()=>''}=ctx;let investor='foreign',from='',to='',streakWindow=10,quickSort=localStorage.getItem('rebuild.quick-filter.m03.sort.v1')||'foreign',rules=readRules(),historyCache=new Map();const pages={institutional:0,quick:0},pageSize=10;
 function stockPage(key,rows,render){const result=pageM03Rows(rows,pages[key],pageSize);pages[key]=result.page;const list=`<div class="m03-stock-list">${result.rows.map(render).join('')}</div>`;if(result.totalPages<=1)return list;return `${list}<nav class="mobile-list-pagination" aria-label="個股列表分頁"><button type="button" data-m03-page="prev" data-m03-list="${key}" ${result.page===0?'disabled':''}>上一頁</button><span role="status">第 ${result.page+1} 頁・${result.page*pageSize+1}–${Math.min((result.page+1)*pageSize,result.total)}／${result.total} 檔</span><button type="button" data-m03-page="next" data-m03-list="${key}" ${result.page===result.totalPages-1?'disabled':''}>下十檔</button></nav>`;}
 const loadHistory=async count=>{
  const latest=state.index?.latest_daily_tw;
  if(!latest)throw Error('canonical 行情索引尚未載入。');
  const dates=[...new Set(state.index?.available_days_tw??[])].filter(date=>/^\d{4}-\d{2}-\d{2}$/.test(date)&&date<=latest).sort().slice(-count);
  if(!dates.length)throw Error('canonical 行情索引沒有可用交易日。');
  const days=await Promise.all(dates.map(async date=>{
   if(!historyCache.has(date))historyCache.set(date,publicData(`daily/tw/${date}.json`));
   try{return {date,data:await historyCache.get(date)};}
   catch(error){historyCache.delete(date);throw error;}
  }));
  return days;
 };
 const eligible=(id,date)=>resolveListingStatus(id,date,state.listing).eligible;
 const rowBySymbol=()=>new Map(state.rows.map(row=>[row.symbol,row]));
 const isFund=(id,quotes)=>quotes.get(id)?.securityType==='fund'||state.listing?.stocks?.[id]?.securityType==='fund';
 const securityHref=symbol=>`#/security?symbol=${encodeURIComponent(symbol)}`;
 const stockCard=(row,metrics)=>`<article class="m03-stock-card"><a href="${securityHref(row.symbol)}" aria-label="${e(row.name)} ${e(row.symbol)} 個股詳情"><span class="m03-stock-identity"><strong>${e(row.name)}</strong><small>${e(row.symbol)}</small></span><span class="m03-stock-quote"><b>${Number.isFinite(row.price)?n(row.price):'資料不足'}</b><small class="${row.changePercent>0?'up':row.changePercent<0?'down':'muted'}">${Number.isFinite(row.changePercent)?`${row.changePercent>0?'+':''}${n(row.changePercent)}%`:'漲跌幅資料不足'}</small></span></a>${favoriteButton(row.symbol,row.name,`m03-${row.symbol}`)}<div class="m03-stock-metrics">${metrics}</div></article>`;
 const metric=(label,value,cls='')=>`<span><small>${e(label)}</small><b class="${cls}">${e(value)}</b></span>`;
 async function institutional(){
  const days=await loadHistory(20),selected=days.filter(day=>(!from||day.date>=from)&&(!to||day.date<=to));
  if(!from)from=selected.at(-20)?.date??selected[0]?.date??days.at(-1).date;
  if(!to)to=days.at(-1).date;
  const range=days.filter(day=>day.date>=from&&day.date<=to),source=SOURCES[investor],quotes=rowBySymbol();
  const points=range.map(({date,data})=>{
   let total=0,count=0;
   for(const row of data.stocks??[]){if(!eligible(row.id,taipeiDay())||isFund(row.id,quotes)||!Number.isFinite(row.c)||row.c<=0||!Number.isFinite(row[source.key]))continue;total+=row.c*row[source.key]*1000/100000000;count++;}
   return {date,amount:count&&Number.isFinite(total)?total:null,count};
  }).filter(point=>Number.isFinite(point.amount));
  const latest=days.at(-1),recentMaps=days.slice(-streakWindow).map(day=>new Map((day.data.stocks??[]).map(row=>[row.id,row]))),previous=new Map((days.at(-2)?.data.stocks??[]).map(row=>[row.id,row])),leaders=[];
  for(const raw of latest.data.stocks??[]){
   const net=raw[source.key];if(!eligible(raw.id,taipeiDay())||isFund(raw.id,quotes)||!Number.isFinite(net)||net<=0)continue;
   let streak=0;for(let i=recentMaps.length-1;i>=0;i--){const daily=recentMaps[i].get(raw.id)?.[source.key];if(!Number.isFinite(daily)||daily<=0)break;streak++;}
   if(streak===0)continue;
   const base=quotes.get(raw.id)??identity(raw.id,{},state.listing?.stocks?.[raw.id]),prior=previous.get(raw.id)?.c;
   const calculatedChange=Number.isFinite(prior)&&prior>0&&Number.isFinite(raw.c)?(raw.c/prior-1)*100:NaN;
   const quote={...base,price:Number.isFinite(raw.c)&&raw.c>0?raw.c:base.price,changePercent:Number.isFinite(calculatedChange)?calculatedChange:base.changePercent};
   leaders.push({quote,net,streak});
  }
  leaders.sort((a,b)=>b.net-a.net||compareCodepoints(a.quote.symbol,b.quote.symbol));
  const list=leaders.length?stockPage('institutional',leaders,({quote,net,streak})=>stockCard(quote,metric(`${source.label}買賣超`,`${net>0?'+':''}${n(net,0)} 張`,net>0?'up':'')+metric('連買天數',`${streak} 天`))):status('沒有連買標的','最近觀察期間沒有符合資格且連續買超的證券。');
  const tabs=Object.entries(SOURCES).map(([key,item])=>`<button type="button" data-m03-investor="${key}" aria-pressed="${key===investor}" class="${key===investor?'primary':''}">${item.label}</button>`).join('');
  const windowOptions=[5,10,20].map(value=>`<option value="${value}" ${streakWindow===value?'selected':''}>近 ${value} 日</option>`).join('');
  return card('法人布局',`<div class="m03-source-tabs" role="group" aria-label="法人類別">${tabs}</div><form id="m03-range" class="m03-date-range"><label>統計期間起日<input type="date" name="from" value="${e(from)}" max="${e(to)}" required></label><span aria-hidden="true">～</span><label>迄日<input type="date" name="to" value="${e(to)}" min="${e(from)}" max="${e(latest.date)}" required></label><button class="primary">套用</button></form><p class="muted">行情日期 ${e(latest.date)}・法人來源為每日原始買賣超（張），金額以當日原始收盤換算億元；逐日有效證券筆數 ${points.length?`${Math.min(...points.map(x=>x.count))}–${Math.max(...points.map(x=>x.count))}`:'資料不足'}。</p>`)+card(`${source.label}買賣超金額（億元）`,amountChart(points,source.label))+card(`${source.label}連買標的`,`<div class="m03-list-controls"><span>連買天數</span><label><span class="sr-only">觀察期間</span><select data-m03-streak-window aria-label="連買觀察期間">${windowOptions}</select></label></div>${list}`);
 }
 async function quickFilter(){
  const days=await loadHistory(5),complete=days.length===5;
  if(!complete)return status('短期快篩資料不足','canonical 可用交易日少於五日，無法套用計劃書條件。');
  const first=days[0],latest=days.at(-1),firstById=new Map((first.data.stocks??[]).map(row=>[row.id,row])),perDay=days.map(day=>new Map((day.data.stocks??[]).map(row=>[row.id,row]))),quotes=rowBySymbol();
  const items=[];
  for(const raw of latest.data.stocks??[]){
   const id=raw.id;if(!eligible(id,taipeiDay())||isFund(id,quotes)||!Number.isFinite(raw.c)||raw.c<=0)continue;
   const series=perDay.map(map=>map.get(id));if(series.some(row=>!row||!Number.isFinite(row.c)||row.c<=0||!Number.isFinite(row.v)||row.v<0||!Number.isFinite(row.f)))continue;
   const begin=firstById.get(id);if(!begin||!Number.isFinite(begin.c)||begin.c<=0)continue;
   const volumeLots=series.reduce((sum,row)=>sum+row.v,0)/1000,returnPct=(raw.c/begin.c-1)*100,foreignLots=series.reduce((sum,row)=>sum+row.f,0),base=quotes.get(id)??identity(id,{},state.listing?.stocks?.[id]),prior=perDay.at(-2)?.get(id)?.c;
   if(!Number.isFinite(volumeLots)||!Number.isFinite(returnPct)||!Number.isFinite(foreignLots))continue;
   const calculatedChange=Number.isFinite(prior)&&prior>0?(raw.c/prior-1)*100:NaN;
   const quote={...base,price:raw.c,changePercent:Number.isFinite(calculatedChange)?calculatedChange:base.changePercent};
   if(volumeLots>=rules.volumeLots&&returnPct>=rules.returnPct&&foreignLots>=rules.foreignLots&&raw.c>=rules.price)items.push({quote,volumeLots,returnPct,foreignLots});
  }
  items.sort((a,b)=>{
   const aValue=quickSort==='volume'?a.volumeLots:quickSort==='return'?a.returnPct:a.foreignLots,bValue=quickSort==='volume'?b.volumeLots:quickSort==='return'?b.returnPct:b.foreignLots;
   return bValue-aValue||compareCodepoints(a.quote.symbol,b.quote.symbol);
  });
  const list=items.length?stockPage('quick',items,item=>stockCard(item.quote,metric('近5日成交量',`${n(item.volumeLots,0)} 張`)+metric('近5日外資買超',`${n(item.foreignLots,0)} 張`,item.foreignLots>0?'up':'')+metric('近5日漲幅',`${item.returnPct>0?'+':''}${n(item.returnPct)}%`,item.returnPct>0?'up':'down'))):status('沒有符合條件的個股','可調整條件或確認最近五個交易日的資料覆蓋。');
  const sortOptions=[['foreign','依外資買超排序'],['volume','依成交量排序'],['return','依近5日漲幅排序']].map(([value,label])=>`<option value="${value}" ${quickSort===value?'selected':''}>${label}</option>`).join('');
  return card('條件摘要',`<div class="m03-rule-summary"><p><span>✓</span>近 5 日成交量 ≥ ${n(rules.volumeLots,0)} 張</p><p><span>✓</span>近 5 日股價漲幅 ≥ ${n(rules.returnPct)}%</p><p><span>✓</span>近 5 日外資買超 ≥ ${n(rules.foreignLots,0)} 張</p><p><span>✓</span>最新原始收盤價 ≥ ${n(rules.price)} 元</p></div><details class="m03-rule-editor"><summary>編輯條件</summary><form id="m03-rules" class="m03-rule-form">${[['volumeLots','近 5 日成交量門檻（張）'],['returnPct','近 5 日漲幅門檻（%）'],['foreignLots','近 5 日外資買超門檻（張）'],['price','最新原始收盤價門檻（元）']].map(([key,label])=>`<label>${label}<input name="${key}" type="number" min="0" step="any" value="${rules[key]}" required></label>`).join('')}<button class="primary">套用條件</button><button type="button" data-m03-rules-reset>還原計劃預設</button></form></details><p class="muted">資料期間 ${e(first.date)} 至 ${e(latest.date)}・市場價格使用原始收盤價；需五個交易日都有有效收盤、成交量及外資資料。</p>`)+card('短期快篩結果',`<div class="m03-list-controls"><strong>共篩選出 ${items.length} 檔個股</strong><label><span class="sr-only">排序依據</span><select data-m03-quick-sort aria-label="快篩結果排序">${sortOptions}</select></label></div>${list}`);
 }
 function page(id){return id==='institutional'?institutional():quickFilter();}
 function listen(app,refresh){
  app.addEventListener('click',async event=>{
   const pageButton=event.target.closest('[data-m03-page]');if(pageButton){const key=pageButton.dataset.m03List;if(!['institutional','quick'].includes(key))return;pages[key]=Math.max(0,pages[key]+(pageButton.dataset.m03Page==='next'?1:-1));await refresh();document.querySelector('.m03-stock-list')?.scrollIntoView({block:'start',behavior:'instant'});return;}
   const tab=event.target.closest('[data-m03-investor]');if(tab){investor=tab.dataset.m03Investor;pages.institutional=0;await refresh();return;}
   if(event.target.closest('[data-m03-rules-reset]')){event.preventDefault();rules={...DEFAULT_RULES};pages.quick=0;localStorage.setItem('rebuild.quick-filter.m03.v1',JSON.stringify(rules));await refresh();}
  });
  app.addEventListener('submit',async event=>{
   const form=event.target;if(!['m03-range','m03-rules'].includes(form.id))return;event.preventDefault();const data=Object.fromEntries(new FormData(form));
   if(form.id==='m03-range'){if(data.from>data.to){form.querySelector('[role=status]')?.remove();form.insertAdjacentHTML('beforeend','<p role="status" class="alert">起日不可晚於迄日。</p>');return;}from=data.from;to=data.to;pages.institutional=0;await refresh();return;}
   const next=Object.fromEntries(Object.keys(DEFAULT_RULES).map(key=>[key,Number(data[key])]));if(Object.values(next).some(value=>!Number.isFinite(value)||value<0)){form.insertAdjacentHTML('beforeend','<p role="status" class="alert">門檻必須是非負有限數值。</p>');return;}rules=next;pages.quick=0;localStorage.setItem('rebuild.quick-filter.m03.v1',JSON.stringify(rules));await refresh();
  });
  app.addEventListener('change',async event=>{
   if(event.target.matches('[data-m03-streak-window]')){const value=Number(event.target.value);if([5,10,20].includes(value)){streakWindow=value;pages.institutional=0;await refresh();}}
   if(event.target.matches('[data-m03-quick-sort]')){const value=event.target.value;if(['foreign','volume','return'].includes(value)){quickSort=value;pages.quick=0;localStorage.setItem('rebuild.quick-filter.m03.sort.v1',value);await refresh();}}
  });
 }
 return {handles:id=>['institutional','quick-filter'].includes(id),page,listen};
}

export function pageM03Rows(rows,page,pageSize=10){
 const size=Math.max(1,Math.floor(Number(pageSize)||10)),total=rows.length,totalPages=Math.max(1,Math.ceil(total/size)),current=Math.max(0,Math.min(totalPages-1,Math.floor(Number(page)||0)));
 return {rows:rows.slice(current*size,(current+1)*size),page:current,pageSize:size,total,totalPages};
}
