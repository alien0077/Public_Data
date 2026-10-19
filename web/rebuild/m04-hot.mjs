import {escapeHTML as e,number as n,resolveListingStatus,taipeiDay,compareCodepoints} from './core.mjs';

function median(values){
 const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b);
 if(!sorted.length)return null;
 const middle=Math.floor(sorted.length/2);
 return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;
}

export function createM04Hot(ctx){
 const {state,card,status,rowList}=ctx;let mode='sectors',sort='turnover';
 function universe(){return state.rows.filter(row=>resolveListingStatus(row.symbol,taipeiDay(),state.listing).eligible&&row.securityType!=='fund'&&((Number.isFinite(row.turnover)&&row.turnover>0)||(Number.isFinite(row.volume)&&row.volume>0)));}
 function sectorRows(rows){
  const grouped=new Map();
  for(const row of rows){const name=String(row.sector||'').trim();if(!name||!Number.isFinite(row.changePercent)||!Number.isFinite(row.turnover)||row.turnover<=0)continue;if(!grouped.has(name))grouped.set(name,[]);grouped.get(name).push(row);}
  return [...grouped].map(([name,members])=>({name,count:members.length,change:median(members.map(row=>row.changePercent)),turnover:members.reduce((sum,row)=>sum+row.turnover,0)}))
   .filter(row=>Number.isFinite(row.change)&&Number.isFinite(row.turnover)&&row.turnover>0)
   .sort((a,b)=>b.turnover-a.turnover||compareCodepoints(a.name,b.name)).slice(0,36);
 }
 function page(){
  const rows=universe(),sectors=sectorRows(rows),largest=Math.max(1,...sectors.map(row=>row.turnover));
  const tabs=`<div class="m04-mode-tabs" role="group" aria-label="今日最熱分類"><button type="button" data-m04-mode="sectors" aria-pressed="${mode==='sectors'}" class="${mode==='sectors'?'primary':''}">族群漲跌</button><button type="button" data-m04-mode="stocks" aria-pressed="${mode==='stocks'}" class="${mode==='stocks'?'primary':''}">熱門個股</button></div><p class="muted">行情日期 ${e(state.index?.latest_daily_tw??'日期不足')}・漲幅採已確認上市成員的中位數，不代表官方產業指數。</p>`;
  if(mode==='sectors'){
   const map=sectors.length?`<div class="m04-sector-map" role="list" aria-label="族群漲跌熱力圖">${sectors.map(item=>{const columns=Math.max(1,Math.min(4,Math.round(Math.sqrt(item.turnover/largest)*4))),rows=columns>2?2:1,signal=item.change>0?'heatmap-up':item.change<0?'heatmap-down':'heatmap-flat';return `<article role="listitem" class="m04-sector-tile ${signal}" style="--sector-columns:${columns};--sector-rows:${rows}" aria-label="${e(item.name)}，成員漲跌中位數 ${n(item.change)}%，${item.count} 檔"><strong>${e(item.name)}</strong><b>${item.change>0?'+':''}${n(item.change)}%</b><small>${item.count} 檔・成交額 ${n(item.turnover,0)}</small></article>`;}).join('')}</div>`:status('族群行情資料不足','需有有效原始漲跌幅與成交額的已確認上市成員。');
   const ranking=sectors.length?`<ol class="m04-sector-ranking">${[...sectors].sort((a,b)=>b.change-a.change||compareCodepoints(a.name,b.name)).slice(0,8).map((item,index)=>`<li><span>${index+1}</span><strong>${e(item.name)}</strong><small>${item.count} 檔</small><b class="${item.change>0?'up':item.change<0?'down':'muted'}">${item.change>0?'+':''}${n(item.change)}%</b></li>`).join('')}</ol>`:status('尚無族群排行','有效成員行情不足。');
   return card('今日最熱',tabs)+card('族群漲跌',`<p class="muted">區塊面積依族群成員成交額合計；顏色依成員原始漲跌幅中位數。</p>${map}`)+card('族群漲跌排行',ranking);
  }
  const sortOptions=[['turnover','成交額排序'],['volume','成交量排序'],['change','漲幅排序']];
  const ranked=[...rows].sort((a,b)=>{const av=sort==='change'?a.changePercent:sort==='volume'?a.volume:a.turnover,bv=sort==='change'?b.changePercent:sort==='volume'?b.volume:b.turnover;return (Number.isFinite(bv)?bv:-Infinity)-(Number.isFinite(av)?av:-Infinity)||compareCodepoints(a.symbol,b.symbol);}).slice(0,30);
  return card('今日最熱',tabs)+card('熱門個股',`<label class="m04-sort">排序方式<select data-m04-stock-sort aria-label="熱門個股排序">${sortOptions.map(([value,label])=>`<option value="${value}" ${sort===value?'selected':''}>${label}</option>`).join('')}</select></label><p class="muted">最多顯示 30 檔；現價與漲跌幅採原始行情。</p>`)+rowList(ranked,'hot');
 }
 function listen(app,refresh){
  app.addEventListener('click',async event=>{const button=event.target.closest('[data-m04-mode]');if(!button)return;mode=button.dataset.m04Mode;await refresh();});
  app.addEventListener('change',async event=>{if(!event.target.matches('[data-m04-stock-sort]'))return;const value=event.target.value;if(!['turnover','volume','change'].includes(value))return;sort=value;await refresh();});
 }
 return {handles:id=>id==='hot',page,listen};
}
