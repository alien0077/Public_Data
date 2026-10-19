import {escapeHTML as e,number as n} from './core.mjs';

export function valuationRange(value){
 const range=value?.published_range??value?.range??value?.scenario_range;
 if(!range)return '<p class="muted">來源未提供估值情境區間。</p>';
 const points=[['偏空',range.bear],['基準',range.base],['樂觀',range.bull]].filter(([,amount])=>Number.isFinite(amount)&&amount>0);
 if(!points.length)return '<p class="muted">來源未提供有效的正數估值情境。</p>';
 const market=value.market_price,nums=[...points.map(([,x])=>x),...(Number.isFinite(market)&&market>0?[market]:[])],lo=Math.min(...nums),hi=Math.max(...nums),span=hi-lo||Math.max(1,hi*.05),left=60,right=700,x=v=>left+(v-lo)/span*(right-left),y=[105,65,105];
 const shapes=points.map(([label,amount],index)=>`<circle cx="${x(amount).toFixed(1)}" cy="${y[index]}" r="8" fill="${['var(--red)','var(--blue)','var(--green)'][index]}"><title>${label}情境 ${n(amount)} 元</title></circle><text x="${x(amount).toFixed(1)}" y="${y[index]-15}" text-anchor="middle">${n(amount)}</text>`).join('');
 const marketLine=Number.isFinite(market)&&market>0?`<line x1="${x(market).toFixed(1)}" x2="${x(market).toFixed(1)}" y1="26" y2="146" stroke="var(--muted)" stroke-width="2" stroke-dasharray="6 5"><title>估值來源參考市價 ${n(market)} 元</title></line><text x="${x(market).toFixed(1)}" y="165" text-anchor="middle">來源市價</text>`:'';
 return `<svg class="chart valuation-range" viewBox="0 0 740 190" role="img" aria-label="公允價值偏空、基準、樂觀情境，估值來源參考市價以虛線標記"><line class="grid" x1="${left}" x2="${right}" y1="146" y2="146"/><text x="${left}" y="184">${n(lo)}</text><text x="${right}" y="184" text-anchor="end">${n(hi)}</text><line x1="${left}" x2="${right}" y1="146" y2="146" stroke="var(--line)"/>${marketLine}${shapes}</svg><div class="valuation-range-labels">${points.map(([label,amount],i)=>`<span><i style="--scenario-color:${['var(--red)','var(--blue)','var(--green)'][i]}"></i>${e(label)}・${n(amount)} 元</span>`).join('')}</div><p class="muted">區間來源：${e(value.published_range?'published_range':value.range?'range':'scenario_range')}；參考市價取自同一估值資料，不代表即時市價。</p>`;
}
