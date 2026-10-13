import {indexIntraday} from './index-intraday.mjs';
import {escapeHTML as e,number as n,compareCodepoints} from './core.mjs';

export async function marketOverview(ctx){
 const {state,card,metric,link,rowList}=ctx;
 const leaders=key=>state.rows.filter(row=>Number.isFinite(row[key])&&row[key]>0).slice().sort((a,b)=>b[key]-a[key]||compareCodepoints(a.symbol,b.symbol)).slice(0,5);
 const indices=`<div class="tiles">${state.indices.map(row=>card(`${row.name} ${row.symbol}`,`<div class="hero-value">${n(row.price)}</div><p class="source muted">原始市場指數・${e(row.asOf??'資料日期不足')}</p><div class="metric-grid">${metric('成交量',n(row.volume,0))}${metric('成交金額',n(row.turnover,0))}</div><p class="muted">漲跌幅需交易所參考價；缺值不以還原漲幅代替。</p>`)).join('')}</div>`;
 const tools=card('市場工具',['heatmap','rankings','sector-pe','quant','hot','etfs','etf-flows'].map(id=>link(id)).join(''));
 const summary=card('市場概況',metric('已取得合格證券行情',`${state.rows.length} 檔`)+`<p class="source muted">資料日期：${e(state.index.latest_daily_tw??'尚未載入')}</p><p class="muted">涵蓋目前上市資格通過的證券；不是完整市場漲跌家數。</p>`);
 return indices+await indexIntraday(ctx)+summary+tools+card('成交金額焦點',`<p class="source muted">同日原始成交金額排行・${e(state.index.latest_daily_tw??'尚未載入')}</p>`+rowList(leaders('turnover'),'overview.turnover')+link('rankings'))+card('成交量焦點','<p class="muted">原始成交股數排行；數量不是成交金額。</p>'+rowList(leaders('volume'),'overview.volume')+link('hot'));
}
