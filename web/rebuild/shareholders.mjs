import {escapeHTML as e,number as n,taipeiDay} from './core.mjs';

const COLORS=['#2f7de1','#45a17b','#edae49','#d35a72','#6f62bd','#4c99a8','#c67845','#828c45','#b45c9e','#5288a3','#a15a5a','#587e58','#8a6ba7','#a88c3d','#4779aa'];
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/i.test(value);
const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;

export function validateShareholderSnapshot(manifest,shard,symbol,today=taipeiDay()){
 if(manifest?.schemaVersion!==1||manifest.source!=='TDCC official open data id=1-5'||!validDate(manifest.date)||manifest.date>today||!hash(manifest.sourceSha256)||manifest.levelCount!==15||!Array.isArray(manifest.levelDefinitions)||manifest.levelDefinitions.length!==15||manifest.levelDefinitions.some((item,index)=>item?.level!==index+1||typeof item.label!=='string'))throw Error('TDCC manifest 不完整、未來日期或版本不符');
 const filename=manifest.symbolToShard?.[symbol];if(typeof filename!=='string'||!/^shard-\d{3}\.json$/.test(filename))throw Error('來源沒有此證券的持股級距');
 if(shard?.schemaVersion!==1||shard.date!==manifest.date||shard.sourceSha256!==manifest.sourceSha256)throw Error('TDCC 分片日期或來源雜湊與 manifest 不一致');
 const data=shard.securities?.[symbol];if(data?.complete!==true||data.sourceDate!==manifest.date||!validDate(data.sourceDate)||!Array.isArray(data.levels)||data.levels.length!==15||data.levels.some((item,index)=>item?.level!==index+1||typeof item.label!=='string'||!Number.isSafeInteger(item.holders)||item.holders<0||!Number.isSafeInteger(item.shares)||item.shares<0||!Number.isFinite(item.percentage)||item.percentage<0||item.percentage>100)||data.levels.reduce((sum,item)=>sum+item.percentage,0)>101||!Number.isSafeInteger(data.totalHolders)||data.totalHolders<0||!Number.isSafeInteger(data.totalShares)||data.totalShares<=0||!Number.isFinite(data.totalPercentage)||data.totalPercentage<99||data.totalPercentage>101||!Number.isSafeInteger(data.adjustment?.holders)||data.adjustment.holders<0||!Number.isSafeInteger(data.adjustment?.shares)||!Number.isFinite(data.adjustment?.percentage)||Math.abs(data.adjustment.percentage)>100)throw Error('TDCC 官方分級資料不完整或數值不合法');
 return data;
}

function distributionCard(ctx,data,symbol,name,manifest){
 const total=data.levels.reduce((sum,item)=>sum+item.percentage,0),colors=data.levels.map((_,i)=>COLORS[i]);
 let cursor=0;
 const stops=data.levels.map((item,i)=>{const start=cursor;cursor+=item.percentage;return `${colors[i]} ${start.toFixed(2)}% ${Math.min(cursor,100).toFixed(2)}%`;}).join(',');
 const age=Math.max(0,Math.floor((Date.parse(`${taipeiDay()}T00:00:00Z`)-Date.parse(`${data.sourceDate}T00:00:00Z`))/86400000));
 const freshness=age>14?`<p class="alert">TDCC 資料距今 ${age} 日；保留來源數據供查閱，但不當作最新持股。</p>`:`<p class="muted">來源資料距今 ${age} 日；每週最後營業日統計，不是即時持股。</p>`;
 const summary=ctx.card(`${name} ${symbol}・股權分散`,`<div class="shareholder-overview"><div class="shareholder-donut" role="img" aria-label="${e(name)} ${e(symbol)} TDCC 15 級分布，資料日 ${e(data.sourceDate)}，級距占比合計 ${n(total)}%" style="--shareholder-pie:conic-gradient(${stops})"><span><strong>${n(data.totalHolders,0)}</strong><small>持有人數</small></span></div><div class="metric-grid">${ctx.metric('集保總股數',n(data.totalShares,0))}${ctx.metric('級距占比合計',`${n(total)}%`)}${ctx.metric('TDCC 來源日期',e(data.sourceDate))}${ctx.metric('來源代碼','TDCC 1-5')}</div></div>${freshness}<p class="muted">官方 1–15 級；16 為差異調整、17 為合計列，不混入各級距。</p><p class="muted">原始資料 SHA-256：${e(manifest.sourceSha256)}</p>`);
 const rows=ctx.card('持股級距明細・股數／人數／集保庫存比例',`<div class="shareholder-levels" role="table" aria-label="${e(name)} ${e(symbol)} TDCC 官方級距明細"><div class="shareholder-level-row shareholder-level-head" role="row"><strong>持股級距</strong><strong>人數</strong><strong>持有股數</strong><strong>占比</strong></div>${data.levels.map((item,i)=>`<div class="shareholder-level-row" role="row"><span role="cell"><i style="--tier-color:${colors[i]}"></i>${e(item.label)}</span><span role="cell" data-label="人數">${n(item.holders,0)}</span><span role="cell" data-label="持有股數">${n(item.shares,0)}</span><span role="cell" data-label="占比">${n(item.percentage)}%</span></div>`).join('')}</div><p class="muted">第 16 級差異調整 ${n(data.adjustment.shares,0)} 股・${n(data.adjustment.percentage)}%；第 17 級官方合計 ${n(data.totalShares,0)} 股・${n(data.totalPercentage)}%。</p>`);
 return summary+rows;
}

export async function shareholderDistributionPage(ctx,symbol,row){
 const {publicData,card,status}=ctx;
 let aggregate='';
 try{
  const [manifestResult,stockResult]=await Promise.allSettled([publicData('rebuild/shareholder-distribution/manifest.json'),publicData(`stocks/${encodeURIComponent(symbol)}.json`)]);
  if(stockResult.status==='fulfilled'){
   const stock=stockResult.value;
   aggregate=card('官方摘要・彙總指標',`<div class="metric-grid">${ctx.metric('彙總資料週別',e(stock.source_dates?.weekly??'資料日期不足'))}${ctx.metric('大戶持股變動',Number.isFinite(stock.tdcc?.big_holder_change)?n(stock.tdcc.big_holder_change):'資料不足')}${ctx.metric('散戶持股變動',Number.isFinite(stock.tdcc?.retail_holder_change)?n(stock.tdcc.retail_holder_change):'資料不足')}${ctx.metric('持股集中度',Number.isFinite(stock.tdcc?.holder_concentration)?n(stock.tdcc.holder_concentration):'資料不足')}</div><p class="muted">此為 Public_Data 健檢摘要，與下方 TDCC 15 級官方持股表分開呈現。</p>`);
  }
  if(manifestResult.status==='rejected')return aggregate+status('TDCC 持股級距暫不可用',manifestResult.reason?.message??'Public_Data 尚無正規化分級檔。','↗',true);
  const manifest=manifestResult.value;
  const filename=manifest.symbolToShard?.[symbol];
  if(typeof filename!=='string'||!/^shard-\d{3}\.json$/.test(filename))return aggregate+status('尚無此證券 TDCC 級距','Public_Data 沒有此證券的官方持股級距；不以彙總集中度拆算。');
  const shard=await publicData(`rebuild/shareholder-distribution/${filename}`),data=validateShareholderSnapshot(manifest,shard,symbol);
  return aggregate+card('股權分散資料',`<p>官方來源：${e(manifest.source)}・資料日期 ${e(data.sourceDate)}・每週最後營業日。</p>`)+distributionCard(ctx,data,symbol,row.name||symbol,manifest);
 }catch(error){return aggregate+status('TDCC 持股級距暫不可用',error.message,'↗',true);}
}
