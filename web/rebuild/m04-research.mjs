import {escapeHTML as e,number as n,resolveListingStatus,taipeiDay} from './core.mjs';
import {median} from './research.mjs';

export function createM04Research(ctx){
 const {state,card,status,rowList,publicData}=ctx;
 let selected='',query='',range='1y';
 async function page(){
  let source;
  try { source=await publicData('quant/sector_pe.json'); }
  catch(error) {
   if (/資料讀取失敗（404）/.test(error?.message??'')) return status('族群本益比資料不足','讀取 quant/sector_pe.json 回應 404；請確認 Public_Data 部署與目前資料環境一致。','◇');
   throw error;
  }
  const groups=source.sectors??[];
  const group=groups.find(item=>item.sector_tag===selected)??groups[0];
  if(!group)return status('尚無族群資料','canonical 族群本益比來源目前沒有可用分組。','◇',true);
  selected=group.sector_tag;
  const members=(group.stocks??[]).filter(stock=>resolveListingStatus(stock.stock_id,taipeiDay(),state.listing).eligible)
   .filter(stock=>!query||`${stock.name??''} ${stock.stock_id} ${group.display_tag??''} ${group.sector_tag??''}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
   .map(stock=>{
    const quote=state.rows.find(row=>row.symbol===stock.stock_id)??{};
    return {...quote,symbol:stock.stock_id,name:stock.name||quote.name||stock.stock_id,
     pe:Number.isFinite(stock.pe_ratio)&&stock.pe_ratio>0?stock.pe_ratio:null,
     eps:Number.isFinite(stock.eps)?stock.eps:null};
   }).sort((a,b)=>(a.pe??Infinity)-(b.pe??Infinity)||String(a.symbol).localeCompare(String(b.symbol)));
  const valid=members.filter(stock=>Number.isFinite(stock.pe)&&stock.pe>0),average=valid.length?valid.reduce((sum,stock)=>sum+stock.pe,0)/valid.length:null;
  const stale=source.date&&state.index?.latest_daily_tw&&source.date<state.index.latest_daily_tw;
  const tabs=`<div class="m04-pe-tabs" role="group" aria-label="族群分類">${groups.map(item=>`<button type="button" data-m04-sector="${e(item.sector_tag)}" aria-pressed="${item.sector_tag===selected}" class="${item.sector_tag===selected?'primary':''}">${e(item.display_tag||item.sector_tag)}</button>`).join('')}</div>`;
  const search=`<form class="m04-pe-search" data-m04-pe-search><label>搜尋成分股<input type="search" name="query" value="${e(query)}" placeholder="名稱或代號"></label><button type="submit">搜尋</button></form>`;
  const summary=card(group.display_tag||group.sector_tag,`${tabs}<div class="m04-pe-summary">${[['本益比中位數',median(valid.map(stock=>stock.pe))],['平均本益比',average],['成分股數',`${valid.length} / ${members.length}`]].map(([label,value])=>`<div><small>${e(label)}</small><strong>${typeof value==='number'?`${n(value)} 倍`:e(value??'資料不足')}</strong></div>`).join('')}</div><p class="muted">本益比資料日期 ${e(source.date??'日期不足')}・最新行情 ${e(state.index?.latest_daily_tw??'日期不足')}・${stale?'族群估值快照較新行情舊，數值不代表同一時點。':''}族群依來源 market_theme 分組，不等同官方產業分類。</p>`);
  const periods=[['3m','3月'],['6m','6月'],['1y','1年'],['3y','3年']];
  const rangeLabel=periods.find(([value])=>value===range)?.[1]??'1年';
  const trend=card(`近${rangeLabel}本益比走勢（中位數）`, `<div class="m04-pe-ranges" role="group" aria-label="趨勢期間">${periods.map(([value,label])=>`<button type="button" data-m04-pe-range="${value}" aria-pressed="${range===value}" class="${range===value?'primary':''}">${label}</button>`).join('')}</div><div class="m04-pe-empty" role="status"><strong>歷史趨勢資料不足</strong><span>canonical 來源目前只有單一日期快照，沒有可驗證的歷史 EPS／本益比序列；不以單點資料補成走勢圖。</span></div>`);
  const list=card('成分股（依本益比由低到高）',`${search}<p class="muted">欄位：股票名稱與代號、原始現價、本益比、EPS。</p>${members.length?rowList(members,'sector-pe'):status('沒有符合的成分股','來源成分股皆不在今日有效上市清單，或沒有符合搜尋條件。')}`);
  return summary+trend+list;
 }
 function listen(app,refresh){
  app.addEventListener('click',async event=>{
   const sector=event.target.closest('[data-m04-sector]');if(sector){selected=sector.dataset.m04Sector;await refresh();return;}
   const button=event.target.closest('[data-m04-pe-range]');if(button){range=button.dataset.m04PeRange;await refresh();}
  });
  app.addEventListener('submit',async event=>{if(!event.target.matches('[data-m04-pe-search]'))return;event.preventDefault();query=new FormData(event.target).get('query')?.toString().trim()??'';await refresh();});
 }
 return {handles:id=>id==='sector-pe',page,listen};
}
