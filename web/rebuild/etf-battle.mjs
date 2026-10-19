import {number as n,escapeHTML as e} from './core.mjs';

const CATEGORIES=[['today','今日'],['dividend','高股息'],['theme','主題'],['bond','債券']];
const THEME_EXCLUSIONS=new Set(['index','high_dividend','bond','active_bond','active','futures','overseas']);

function categoryMembers(summary,category){
 if(category==='today')return null;
 if(category==='dividend')return new Set(summary?.high_dividend?.etfs||[]);
 if(category==='bond')return new Set([...(summary?.bond?.etfs||[]),...(summary?.active_bond?.etfs||[])]);
 const keys=Object.keys(summary||{}).filter(key=>!THEME_EXCLUSIONS.has(key));
 return new Set(keys.flatMap(key=>summary[key]?.etfs||[]));
}

export function etfYieldMetric(symbol,summary,snapshot){
 const bond=(summary?.bond?.etfs||[]).includes(symbol)||(summary?.active_bond?.etfs||[]).includes(symbol);
 const value=bond&&Number.isFinite(snapshot?.[symbol]?.metrics?.yield)?snapshot[symbol].metrics.yield:null;
 return {label:bond?'債券殖利率':'配息率',value};
}

export function selectETFMarketRows(rows,summary,category){
 const members=categoryMembers(summary,category);
 return rows.filter(row=>row.securityType==='fund'&&(!members||members.has(row.symbol)))
  .sort((a,b)=>Number(b.volume||0)-Number(a.volume||0)||String(a.symbol).localeCompare(String(b.symbol),'en'));
}

export function pageETFMarketRows(rows,page,pageSize=10){
 const size=Math.max(1,Math.floor(Number(pageSize)||10)),total=rows.length,totalPages=Math.max(1,Math.ceil(total/size)),current=Math.max(0,Math.min(totalPages-1,Math.floor(Number(page)||0)));
 return {rows:rows.slice(current*size,(current+1)*size),page:current,pageSize:size,total,totalPages};
}

export function createETFMarketPage(ctx){
 const {state,card,status,publicData}=ctx;let selected='today',selectedPage=0,snapshot=null,categories=null,loading=null,loadFailure='';
 function loadSources(){
  if(loading)return loading;
  loading=Promise.allSettled([
   publicData('quant/etf/outputs/category_summary.json').then(value=>{categories=value;}),
   publicData('quant/etf/outputs/latest_snapshot.json').then(value=>{snapshot=value;})
  ]).then(results=>{
   const failed=results.find(item=>item.status==='rejected');
   if(failed)loadFailure=failed.reason?.message||String(failed.reason);
   void ctx.refresh();
  });
  return loading;
 }
 function page(){
  const quotes=state.rows.filter(row=>row.securityType==='fund');
  const rows=selectETFMarketRows(quotes,categories,selected);
  const tabs=`<div class="m07-etf-tabs" role="group" aria-label="ETF 戰情分類">${CATEGORIES.map(([id,title])=>`<button type="button" data-etf-battle-category="${id}" aria-pressed="${selected===id}" class="${selected===id?'primary':''}">${title}</button>`).join('')}</div>`;
  let body='';
  if(!loading)void loadSources();
  if(loadFailure)body+=status('ETF 分類資料讀取失敗',loadFailure);
  if(state.listing?.cutoff!==new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei'}).format(new Date())&&!state.rows.length){
   body+=status('目前 ETF 名冊尚未載入','Public_Data meta/stocks.json 現行股票名冊尚未同步，暫時無法列出 ETF。');
  }else if(selected!=='today'&&!rows.length){
   const title=CATEGORIES.find(([id])=>id===selected)?.[1]||'ETF';
   body+=status(`${title}分類資料不足`,categories
    ?'Public_Data ETF 分類索引中沒有符合此分類的現行基金。'
    :'Public_Data ETF 分類索引尚未載入；不依基金名稱或殖利率推測分類。');
  }else if(!rows.length){
   body+=status('ETF 行情尚未載入','Public_Data 最新台股日行情沒有現行 ETF 報價列；不以本機舊行情或其他來源補值。');
  }else{
   body+=`<p class="muted m07-etf-asof">${rows.length} 檔・原始行情日期 ${e(state.index?.latest_daily_tw||'日期不足')}</p>`;
   const renderCard=row=>{const fund=snapshot?.[row.symbol]||{},name=row.name||fund.name||row.symbol,change=Number.isFinite(row.changePercent)?`${row.changePercent>0?'+':''}${n(row.changePercent)}%`:'資料不足',yieldMetric=etfYieldMetric(row.symbol,categories,snapshot),yieldValue=yieldMetric.value===null?'資料不足':`${n(yieldMetric.value)}%`,tone=row.changePercent>0?'up':row.changePercent<0?'down':'';return `<a class="m07-etf-card" href="#/security/${encodeURIComponent(row.symbol)}" data-stock="${e(row.symbol)}"><div class="m07-etf-head"><span><strong>${e(name)}</strong><small>${e(row.symbol)}</small></span><span class="m07-etf-price"><b>${Number.isFinite(row.price)?n(row.price):'資料不足'}</b><em class="${tone}">${e(change)}</em></span></div><div class="m07-etf-metrics"><span><small>成交量</small><b>${Number.isFinite(row.volume)?n(row.volume,0):'資料不足'}</b></span><span><small>${e(yieldMetric.label)}</small><b>${e(yieldValue)}</b></span></div></a>`;};
   const pageRows=pageETFMarketRows(rows,selectedPage,10);selectedPage=pageRows.page;
   body+=`<div class="m07-etf-list">${pageRows.rows.map(renderCard).join('')}</div>`;
   if(pageRows.totalPages>1)body+=`<nav class="mobile-list-pagination" aria-label="ETF 列表分頁"><button type="button" data-etf-battle-page="prev" ${pageRows.page===0?'disabled':''}>上一頁</button><span role="status">第 ${pageRows.page+1} 頁・${pageRows.page*pageRows.pageSize+1}–${Math.min((pageRows.page+1)*pageRows.pageSize,pageRows.total)}／${pageRows.total} 檔</span><button type="button" data-etf-battle-page="next" ${pageRows.page===pageRows.totalPages-1?'disabled':''}>下十檔</button></nav>`;
  }
  return card('ETF 戰情',tabs+body);
 }
 function listen(app){app.addEventListener('click',async event=>{const pageButton=event.target.closest('[data-etf-battle-page]');if(pageButton){selectedPage=Math.max(0,selectedPage+(pageButton.dataset.etfBattlePage==='next'?1:-1));await ctx.refresh();document.querySelector('.m07-etf-list')?.scrollIntoView({block:'start',behavior:'instant'});return;}const button=event.target.closest('[data-etf-battle-category]');if(!button)return;selected=button.dataset.etfBattleCategory;selectedPage=0;await ctx.refresh();document.querySelector('.m07-etf-list')?.scrollIntoView({block:'start',behavior:'instant'});});}
 return {page,listen};
}
