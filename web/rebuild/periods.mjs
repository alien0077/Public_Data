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

export async function periodHistory(ctx,kind,symbol,row){
 const definition=periodDefinitions[kind];if(!definition)return null;
 const payload=await ctx.publicData(`${definition.path}/${encodeURIComponent(symbol)}.json`),rows=periodRows(payload,kind);
 const intro=ctx.card(`${row.name} ${symbol}・${ctx.title(kind)}`,`<p class="source muted">來源：Public_Data / ${e(definition.path)}/${e(symbol)}.json</p>${kind==='earnings'?'<p class="muted">依來源報導期間列示，未把累計財報當成單季數值；不同期間 EPS 不直接加總。</p>':''}`);
 return intro+(rows.length?rows.map(record=>ctx.card(record.period,`<div class="metric-grid">${definition.fields.map(([key,label])=>ctx.metric(label,n(record.values[key]))).join('')}</div>${record.availability?`<p class="source muted">來源可用日：${e(record.availability)}</p>`:''}`)).join(''):ctx.status('尚無可用紀錄','來源未提供此證券的有效歷史資料。'));
}
