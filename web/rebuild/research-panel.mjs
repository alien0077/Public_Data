import {escapeHTML as e,number as n,resolveListingStatus,taipeiDay} from './core.mjs';

export async function researchPanel(ctx,symbol){
 const {state,card,metric,status,publicData}=ctx;
 if(!resolveListingStatus(symbol,taipeiDay(),state.listing).eligible)return status('目前資料不可用','上市資格尚未確認。');
 const row=state.rows.find(item=>item.symbol===symbol)??{symbol,name:state.listing.stocks[symbol]?.name??symbol};
 const [fundamentals,health]=await Promise.allSettled([publicData(`fundamentals/${encodeURIComponent(symbol)}.json`),publicData(`stocks/${encodeURIComponent(symbol)}.json`)]);
 if(!resolveListingStatus(symbol,taipeiDay(),state.listing).eligible)return status('上市資格已過期','請同步今日上市名單。');
 const base=card(`${row.name} ${symbol}・基本資料`,`<div class="metric-grid">${metric('產業',e(row.sector||'資料不足'))}${metric('市場',e(row.market||'資料不足'))}${metric('原始市價',n(row.price))}${metric('日行情市值',n(row.marketCap,0))}</div><p class="source muted">行情日期：${e(row.asOf??'資料日期不足')}</p>`);
 const financial=fundamentals.status==='fulfilled'?card('財務摘要',`<div class="metric-grid">${metric('流通股數',n(fundamentals.value.balance_sheet?.shares_outstanding,0))}${metric('來源 EPS',n(fundamentals.value.income_statement?.eps))}${metric('來源營收',n(fundamentals.value.income_statement?.revenue,0))}${metric('來源淨利',n(fundamentals.value.income_statement?.net_income,0))}</div><p class="source muted">資料截至：${e(fundamentals.value.as_of??'來源日期不足')}・金額單位：${e(fundamentals.value.income_statement?.amount_unit??'來源未提供')}</p><p class="muted">EPS 依來源期間列示，未擅自改稱單季或 TTM。</p>`):status('財務摘要暫不可用','個股行情與圖表仍可獨立閱讀。');
 const observation=health.status==='fulfilled'?card('近期觀察',`<p class="source muted">來源日期：${e(health.value.date??'資料日期不足')}</p>${(health.value.events??[]).map(item=>`<p>${e(typeof item==='string'?item:item.title??'來源未提供摘要')}</p>`).join('')||'<p class="muted">來源未提供事件觀察。</p>'}<p class="muted">來源健檢事件，不是完整新聞串流。</p>`):status('近期觀察暫不可用','來源未提供可讀的個股事件。');
 return base+financial+observation;
}
