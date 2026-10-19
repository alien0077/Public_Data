import {number as n,escapeHTML as e,taipeiDay,resolveListingStatus,identity} from './core.mjs';
import {readTrades,appendTrades,replaceTrade} from './storage.mjs?v=2';
export const assetTradeTypes=['買入','賣出','配息','配股','拆股'];
export function matchesAssetTradeFilter(type,filter){if(!filter)return true;if(filter==='其他')return !['買入','賣出'].includes(type);return type===filter;}
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const day=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}/.test(v)&&Number.isFinite(Date.parse(v.slice(0,10)+'T00:00:00Z'))&&new Date(v.slice(0,10)+'T00:00:00Z').toISOString().slice(0,10)===v.slice(0,10)?v.slice(0,10):null;
const cashSnapshotKey='rebuild.asset.cash.snapshot.v1';
function readCashSnapshot(){try{const x=JSON.parse(localStorage.getItem(cashSnapshotKey));return x&&finite(x.amount)&&x.amount>=0&&day(x.asOf)?x:null;}catch{return null;}}
export function normalizeAssetTrade(raw,index=0){
 const aliases={buy:'買入','買進':'買入',sell:'賣出'};
 const type=aliases[raw.type??raw.side]??raw.type??raw.side;
 const symbol=String(raw.symbol??raw.stock_id??'').trim().toUpperCase(),name=String(raw.name??raw.stockName??'').trim()||symbol;
 const shares=raw.shares??raw.quantity,date=day(raw.date??raw.tradeDate),price=raw.price,fee=raw.fee??0,tax=raw.tax??0;
 const cash=type==='配息',corporate=['配股','拆股'].includes(type);
 const valid=!!symbol&&!!date&&assetTradeTypes.includes(type)&&finite(shares)&&(type==='拆股'?shares!==0:shares>0)&&finite(fee)&&fee>=0&&finite(tax)&&tax>=0&&((cash||corporate)?(price===0&&fee===0&&tax===0):finite(price)&&price>=0);
 return {id:raw.id??index,index,symbol,name,type,shares,price,fee,tax,date,currency:String(raw.currency??'').trim().toUpperCase(),valid,notes:String(raw.notes??''),raw};
}
// Read-only FIFO estimate. Corporate share changes preserve existing lot cost.
export function assetLedger(rawTrades,cutoff=taipeiDay()){
 const positions=new Map(),issues=[],events=[];
 const trades=rawTrades.map(normalizeAssetTrade).sort((a,b)=>(a.date??'').localeCompare(b.date??'')||a.index-b.index);
 for(const t of trades){
  // A future-dated draft is outside this snapshot even if other fields are
  // incomplete; an unparseable date still remains a visible ledger issue.
  if(t.date&&t.date>cutoff)continue;
  if(!t.valid){issues.push(`${t.name} ${t.symbol}：交易格式或類型待核對`);continue;}
  const existing=positions.get(t.symbol);
  const p=existing?{...existing,lots:existing.lots.map(lot=>({...lot}))}:{symbol:t.symbol,name:t.name,shares:0,lots:[],realized:0,dividends:0,buy:0,sell:0};let flow=0,realized=0;
  if(t.type==='買入'){const cost=t.shares*t.price+t.fee+t.tax;p.lots.push({shares:t.shares,cost});p.shares+=t.shares;p.buy+=cost;flow=-cost;}
  if(t.type==='賣出'){
   if(t.shares>p.shares+1e-8){issues.push(`${t.name} ${t.symbol}：賣出超過已知持股`);continue;}
   let left=t.shares,basis=0;while(left>1e-8&&p.lots.length){const lot=p.lots[0],q=Math.min(left,lot.shares),cost=lot.cost*q/lot.shares;basis+=cost;lot.shares-=q;lot.cost-=cost;left-=q;if(lot.shares<1e-8)p.lots.shift();}
   flow=t.shares*t.price-t.fee-t.tax;realized=flow-basis;p.shares=Math.max(0,p.shares-t.shares);p.realized+=realized;p.sell+=flow;
  }
  if(t.type==='配息'){flow=t.shares;p.dividends+=flow;}
  if(['配股','拆股'].includes(t.type)){
   if(p.shares<=0||p.shares+t.shares<=0){issues.push(`${t.name} ${t.symbol}：配股／拆股缺少原始持股或調整後非正股數`);continue;}
   const ratio=(p.shares+t.shares)/p.shares;p.lots.forEach(lot=>lot.shares*=ratio);p.shares+=t.shares;
  }
  if(![p.shares,p.realized,p.dividends,p.buy,p.sell,...p.lots.flatMap(x=>[x.shares,x.cost])].every(finite)){issues.push(`${t.name} ${t.symbol}：數值超出可計算範圍`);continue;}
  positions.set(t.symbol,p);events.push({...t,flow,realized,dividend:t.type==='配息'?t.shares:0});
 }
 return {positions:[...positions.values()].map(p=>({...p,basis:p.lots.reduce((s,x)=>s+x.cost,0)})),events,issues:[...new Set(issues)],trades};
}
export function prepareAssetTradeReplacement(rawTrades,candidate,tradeID){
 const expected=rawTrades.find(item=>String(item.id)===String(tradeID));
 if(!expected)throw Error('找不到原始交易，未寫入變更。');
 const row={...expected,...candidate,id:expected.id};
 const before=assetLedger(rawTrades),proposed=assetLedger(rawTrades.map(item=>String(item.id)===String(tradeID)?row:item));
 if(proposed.issues.length>before.issues.length)throw Error(proposed.issues.at(-1));
 return {row,expected};
}
export function rawHistory(data,expectedSymbol){
 if((expectedSymbol!==undefined&&data?.symbol!==expectedSymbol)||!/^[a-f0-9]{64}$/.test(data?.sourceManifestSHA256??'')||data?.schemaVersion!==2||data.source!=='data.daily.tw.raw_ohlcv'||data.priceBasis!=='raw'||data.dataQuality!=='explicit_rejected_dates_v1'||!Array.isArray(data.rejectedDates)||data.rejectedDates.length>0||data.timestamp?.length!==data.close?.length)throw Error('歷史價格來源缺少原始行情證據');
 const result=new Map();if(!Array.isArray(data?.timestamp)||!Array.isArray(data?.close))return result;
 data.timestamp.forEach((t,i)=>{const c=data.close[i];if(!finite(t)||t<0||t>253402214400||!finite(c)||c<=0)throw Error('歷史價格包含無效日期或收盤價');const date=taipeiDay(new Date(t*1000));if(result.has(date))throw Error('歷史價格包含重複交易日');result.set(date,c);});return result;
}
// EOD securities-only return estimate; withdrawals (sales/dividends) leave the portfolio.
export function assetHistory(rawTrades,histories,from,to){
 const ledger=assetLedger(rawTrades,to),days=[...new Set([...histories.values()].flatMap(h=>[...h.keys()]))].filter(d=>d>=from&&d<=to).sort();
 const points=[];let previous=null,index=100,missing=0;
 for(const date of days){
  const snap=assetLedger(rawTrades,date);let value=0,complete=snap.issues.length===0;
  for(const p of snap.positions.filter(p=>p.shares>1e-8)){const price=histories.get(p.symbol)?.get(date);if(!finite(price)){complete=false;break;}value+=p.shares*price;}
  if(!finite(value))complete=false;
  if(!complete){missing++;previous=null;continue;}
  if(!previous&&points.length===0&&value===0)continue;
  const interval=previous?ledger.events.filter(t=>t.date>previous.date&&t.date<=date):[];
  const flow=interval.reduce((sum,t)=>sum+t.flow,0);
  let change=previous?.value>0?(value+flow)/previous.value-1:null;
  if(previous?.value===0&&value===0&&flow===0)change=0;
  if(!finite(change)||change < -1)change=null;
  if(previous&&change===null)missing++;
  if(change!==null){const next=index*(1+change);if(finite(next))index=next;else{missing++;change=null;}}
  points.push({date,value,index,change});previous={date,value};
 }
 const valid=missing===0&&points.length>1&&ledger.issues.length===0;
 const returns=points.map(p=>p.change).filter(finite),mean=returns.reduce((s,v)=>s+v,0)/(returns.length||1);
 let peak=100,drawdown=0;for(const p of points){peak=Math.max(peak,p.index);drawdown=Math.min(drawdown,p.index/peak-1);}
 const volatility=valid&&returns.length>=20?Math.sqrt(returns.reduce((s,r)=>s+(r-mean)**2,0)/(returns.length-1))*Math.sqrt(252)*100:null;
 const elapsed=points.length>1?(Date.parse(points.at(-1).date)-Date.parse(points[0].date))/86400000:0;
 return {points,missing,valid,totalReturn:valid?(index/100-1)*100:null,annualReturn:valid&&elapsed>=365?(Math.pow(index/100,365.25/elapsed)-1)*100:null,drawdown:valid?drawdown*100:null,volatility,observations:returns.length};
}
export function moneyWeightedReturn(flows){
 const valid=flows.filter(x=>day(x.date)&&finite(x.value));if(valid.length!==flows.length||!valid.some(x=>x.value>0)||!valid.some(x=>x.value<0))return null;
 const start=Math.min(...valid.map(x=>Date.parse(x.date))),end=Math.max(...valid.map(x=>Date.parse(x.date)));if(end-start<86400000)return null;
 const npv=x=>valid.reduce((s,f)=>s+f.value*Math.exp(-x*(Date.parse(f.date)-start)/86400000/365.25),0);
 const brackets=[];let left=-9,fl=npv(left);if(fl===0)brackets.push([left,left]);for(let step=1;step<=360;step++){const right=-9+step*.05,fr=npv(right);if(fr===0)brackets.push([right,right]);else if(finite(fl)&&finite(fr)&&fl!==0&&(fl<0)!==(fr<0))brackets.push([left,right]);left=right;fl=fr;}
 if(brackets.length!==1)return null;let [a,b]=brackets[0];for(let i=0;i<90;i++){const m=(a+b)/2;if(npv(a)*npv(m)<=0)b=m;else a=m;}const result=(Math.exp((a+b)/2)-1)*100;return finite(result)?result:null;
}
const allocationColors=['#2775d1','#de5b5b','#37a76f','#e5a12b','#8c67c7','#299aa3','#d16b9a','#718096'];
export function allocationDonutMarkup(rows,total,favoriteButton=()=> ''){
 const valid=rows.filter(r=>finite(r.value)&&r.value>0&&finite(r.value/total)&&r.value/total>0);
 if(!finite(total)||total<=0||!valid.length)return '<p class="muted">配置資料不足</p>';
 let offset=0;
 const rings=valid.map((row,i)=>{const share=row.value/total*100,start=offset;offset+=share;return `<circle data-symbol="${e(row.symbol)}" cx="120" cy="120" r="78" fill="none" stroke="${allocationColors[i%allocationColors.length]}" stroke-width="30" pathLength="100" stroke-dasharray="${share} ${100-share}" stroke-dashoffset="${-start}"/>`;}).join('');
 const legend=valid.map((row,i)=>`<div class="toolbar"><span aria-hidden="true" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${allocationColors[i%allocationColors.length]}"></span><a class="grow" href="#/security?symbol=${encodeURIComponent(row.symbol)}" aria-label="查看個股：${e(row.name)} ${e(row.symbol)}">${e([row.name,row.symbol].filter(Boolean).join(' '))}</a>${favoriteButton(row.symbol,row.name,`allocation-donut-${row.symbol}`)}<span>${n(row.value)}・${n(row.value/total*100)}%</span></div>`).join('');
 return `<div class="asset-donut-layout"><svg viewBox="0 0 240 240" role="img" aria-label="持股市值配置環圖；各配置項目比例見明細"><g transform="rotate(-90 120 120)">${rings}</g><text x="120" y="112" text-anchor="middle" fill="currentColor">持股市值 TWD</text><text x="120" y="139" text-anchor="middle" fill="currentColor" font-weight="700">${n(total,0)}</text></svg><div class="asset-donut-legend">${legend}</div></div>`;
}
export function cashflowChartMarkup(groups){
 const months=[...groups].filter(([,v])=>[v.buy,v.sell,v.dividend].every(finite)).sort((a,b)=>a[0].localeCompare(b[0])).slice(-12);
 if(!months.length)return '<p class="muted">尚無交易資料，新增交易後會顯示每月買入、賣出與已入帳股利。</p>';
 const width=720,height=250,left=42,right=12,top=18,bottom=48,plotH=height-top-bottom,step=(width-left-right)/months.length,barW=Math.min(28,step*.58);
 const max=Math.max(1,...months.flatMap(([,v])=>[v.buy,v.sell,v.dividend]));
 const colors={buy:'#de5b5b',sell:'#2775d1',dividend:'#37a76f'};
 const ticks=[0,.5,1].map(f=>{const y=top+plotH*(1-f);return `<line x1="${left}" y1="${y}" x2="${width-right}" y2="${y}" stroke="var(--line)"/><text x="${left-6}" y="${y+4}" text-anchor="end" fill="var(--muted)">${n(max*f,0)}</text>`;}).join('');
 const bars=months.map(([month,v],i)=>{const x=left+step*(i+.5)-barW/2;const parts=[['buy',v.buy],['sell',v.sell],['dividend',v.dividend]];return parts.map(([key,value],j)=>{const h=Math.max(value>0?2:0,value/max*plotH);return `<rect data-month="${e(month)}" data-kind="${key}" x="${x+j*barW/3}" y="${top+plotH-h}" width="${barW/3-1}" height="${h}" rx="2" fill="${colors[key]}"><title>${e(month)} ${key==='buy'?'買入支出':key==='sell'?'賣出收入':'已入帳股利'} ${n(value)}</title></rect>`;}).join('')+`<text x="${left+step*(i+.5)}" y="${height-22}" text-anchor="middle" fill="var(--muted)">${e(month.slice(2))}</text>`;}).join('');
 const legend=[['buy','買入支出'],['sell','賣出收入'],['dividend','已入帳股利']].map(([key,label])=>`<span><i style="background:${colors[key]}"></i>${label}</span>`).join('');
 return `<svg class="chart cashflow-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="最近12個有交易月份的現金流柱狀圖；買入支出、賣出收入與已入帳股利分列">${ticks}${bars}</svg><div class="cashflow-legend">${legend}</div><p class="muted">圖表呈現最近 12 個有交易月份；下方仍列出完整帳本期間。</p>`;
}
const notes='FIFO 交易估算，買入含輸入稅費；配股與拆股依增減股數攤平原成本。只讀既有交易，不改写來源。';
export function createAssetsModule(ctx){
 const {state,card,metric,status,rowList,link,publicData,favoriteButton=()=>''}=ctx;let confirmed=false,from='',to='',period=365,kind='',query='',tradePeriod='3m',cash=String(readCashSnapshot()?.amount??''),cashMessage='',error='',saving=false,saved=false,selectedTrade=null,lastPage='',historyDate='',allocationMode='industry';
 const histories=new Map();
 const facts=items=>`<div class="metric-grid">${items.map(([k,v])=>metric(k,typeof v==='number'?n(v):e(v??'資料不足'))).join('')}</div>`;
 const tradeIdentity=t=>{const symbol=String(t.symbol??t.stock_id??'').trim();const rawName=String(t.name??t.stockName??'').trim();return identity(symbol,rawName&&rawName!==symbol?{name:rawName}:null,state.rows.find(row=>row.symbol===symbol),state.listing?.stocks?.[symbol]);};
 const percent=v=>finite(v)?n(v)+'%':'資料不足';
 const line=(points,key,label)=>{
  const valid=points.filter(p=>finite(p[key]));if(valid.length<2)return status('圖表資料不足','至少需要兩筆完整日末估值。');const values=valid.map(p=>p[key]),min=Math.min(...values),max=Math.max(...values),range=max-min||1;
  return `<svg viewBox="0 0 720 220" role="img" aria-label="${e(label)}"><line x1="30" y1="190" x2="700" y2="190" stroke="var(--line)"/><polyline fill="none" stroke="var(--blue)" stroke-width="3" points="${valid.map((p,i)=>`${30+i/(valid.length-1)*670},${180-(p[key]-min)/range*155}`).join(' ')}"/><text x="30" y="18" fill="currentColor">${n(max)}</text><text x="30" y="215" fill="currentColor">${e(valid[0].date)}</text><text x="700" y="215" text-anchor="end" fill="currentColor">${e(valid.at(-1).date)}</text></svg>`;
 };
 const settings=()=>card('分析範圍',`<label><input id="asset-confirm" type="checkbox" ${confirmed?'checked':''}>我已核對本帳本全部交易為新臺幣，且已補齊配息、配股與拆股</label><p class="muted">原始交易沒有完整幣別與帳戶現金欄位。確認前只列個別紀錄；不混算多幣別。確認不會修改交易。</p>`);
 const transactionCard=t=>{const stock=tradeIdentity(t),quote=state.rows.find(row=>row.symbol===t.symbol),quantityLabel=t.type==='配息'?`入帳金額（${t.currency||'幣別未標示'}）`:t.type==='拆股'?'股數增減（非拆股比例）':'交易股數';return card(`${stock.name} ${stock.symbol}`,`${favoriteButton(stock.symbol,stock.name,'asset-transaction-'+stock.symbol)}<div class="toolbar"><a href="#/security?symbol=${encodeURIComponent(stock.symbol)}">查看個股：${e(stock.name)} ${e(stock.symbol)}</a><strong>${e(t.type||'未知類型')}</strong><span>${e(t.date||'日期待核對')}</span><a href="#/trade?trade=${encodeURIComponent(String(t.id))}">交易明細</a><a href="#/edit-trade?trade=${encodeURIComponent(String(t.id))}">編輯</a></div>${facts([['目前市價（原始價格）',quote?.price],['目前漲跌幅',quote?.changePercent],['行情日期',state.index?.latest_daily_tw],[quantityLabel,t.type==='配息'?`${n(t.shares)} ${t.currency||''}`:t.type==='拆股'?`${n(t.shares)} 股變動`:t.shares],['歷史成交價',['買入','賣出'].includes(t.type)?t.price:'不適用'],['交易幣別',t.currency||'舊紀錄未標示'],['手續費',t.fee],['交易稅',t.tax]])}<p class="muted">${e(t.notes)}</p>${t.valid?'':status('紀錄待核對','不符合分析格式；原始資料已保留。')}`);};
 async function page(id,symbol){
  if(id==='offline'){
   const body=await page('assets',symbol);
   return `<div class="alert m23-offline-banner" role="status"><strong>離線模式</strong><p>目前離線，僅顯示已載入的本機資料與 Public_Data 來源日期；不更新行情。</p><small>行情來源日：${e(state.index?.latest_daily_tw??'尚未載入')}</small></div>${body}`;
  }
  if(!['assets','holdings','allocation','risk','performance','annual','cashflow','transactions','trade','new-trade','edit-trade'].includes(id))return null;
  const pageKey=`${id}:${location.hash}`;if(pageKey!==lastPage){if(['new-trade','edit-trade'].includes(id)){saved=false;error='';saving=false;}lastPage=pageKey;}
  const raw=await readTrades(),ledger=assetLedger(raw),eligible=p=>resolveListingStatus(p.symbol,taipeiDay(),state.listing).eligible;
  const active=ledger.positions.filter(p=>p.shares>1e-8),quotes=new Map(state.rows.map(q=>[q.symbol,q]));
  const rows=active.filter(eligible).map(p=>{const q=quotes.get(p.symbol);return {...q,...p,name:q?.name||p.name,price:q?.price??null,cost:p.basis/p.shares,value:finite(q?.price)?q.price*p.shares:null,pnl:finite(q?.price)?q.price*p.shares-p.basis:null};});
  const mixedCurrency=ledger.trades.some(t=>t.currency&&t.currency!=='TWD');
  const complete=confirmed&&!mixedCurrency&&ledger.issues.length===0&&rows.length===active.length&&rows.every(r=>finite(r.value))&&finite(rows.reduce((sum,r)=>sum+r.value,0))&&finite(rows.reduce((sum,r)=>sum+r.basis,0));
  const value=complete?rows.reduce((s,r)=>s+r.value,0):null,basis=complete?rows.reduce((s,r)=>s+r.basis,0):null,pnl=value!==null?value-basis:null;
  const warnings=ledger.issues.map(m=>status('交易核對',m,'!')).join('')+(mixedCurrency?status('交易幣別不一致','帳本含明確標示的新臺幣以外交易；暫不合併計算資產與績效。','!'):'')+(active.length!==rows.length?status('部分持股未計價',`${active.length-rows.length} 檔尚未通過目前上市資格；歷史紀錄保留，完整總額不以部分合計代替。`,'!'):'');
  const desktop=matchMedia('(min-width: 1100px)').matches;
  const realized=confirmed&&ledger.issues.length===0?ledger.positions.reduce((sum,p)=>sum+p.realized,0):null;
  const cashSnapshot=readCashSnapshot(),totalGain=finite(pnl)&&finite(realized)?pnl+realized:null,totalAssets=complete&&finite(value)&&cashSnapshot?value+cashSnapshot.amount:null;
  const desktopSummary=facts([['總資產市值',totalAssets],['總損益',totalGain],['已實現損益',realized],['未實現損益',pnl],['持股檔數',active.length],['現金',cashSnapshot?.amount]]);
  const desktopTabs=[['holdings','持股'],['allocation','配置'],['risk','風險'],['performance','績效'],['transactions','交易']];
  const desktopFrame=(content,activeTab='holdings',single=false)=>`<div class="desktop-page desktop-assets${single?' d04-single':''}"><section class="desk-asset-summary">${card('資產摘要',desktopSummary+`<p class="muted">TWD・持股估值使用 Public_Data 原始收盤價。未輸入本機現金快照時，現金與含現金總資產均顯示資料不足；${notes}</p>`)}</section><nav class="desk-asset-nav" aria-label="資產工作台分頁">${desktopTabs.map(([route,label])=>`<a href="#/${route}" ${activeTab===route?'aria-current="page"':''}>${label}</a>`).join('')}</nav>${content}</div>`;
  const desktopRoute=(content,activeTab)=>desktop?warnings+desktopFrame(`<section class="d04-main-panel">${content}</section>`,activeTab,true):warnings+content;
  const overview=card('持股市值・TWD',`<div class="hero-value">${n(value,0)}</div>${facts([['未實現損益',pnl],['持股成本',basis],['行情日期',state.index?.latest_daily_tw],['持股檔數',active.length]])}<p class="muted">原始市場價格；不含未記錄現金、待交割款或未知證券。${notes}</p>`);
  if(id==='new-trade'||id==='edit-trade'){
   const query=new URLSearchParams(location.hash.split('?')[1]||''),editingTrade=id==='edit-trade'?ledger.trades.find(t=>String(t.id)===query.get('trade')):null;
   if(id==='edit-trade'&&!editingTrade)return status('找不到這筆交易','原始交易可能已變更；請返回交易紀錄重新選擇。');
   const prefillSymbol=String(editingTrade?.symbol||symbol||query.get('symbol')||'').trim().toUpperCase(),prefillName=editingTrade?.name||(state.rows.find(r=>r.symbol===prefillSymbol)?.name??state.stockMetadata?.get(prefillSymbol)?.name??''),requestedType=editingTrade?.type||(assetTradeTypes.includes(query.get('side'))?query.get('side'):'買入');
   const special=!['買入','賣出'].includes(requestedType),requestedSpecial=assetTradeTypes.filter(type=>!['買入','賣出'].includes(type)).includes(requestedType)?requestedType:'配息';
   const edit=id==='edit-trade';
   return card(edit?'編輯交易':'新增交易',`<form id="asset-trade-form" class="stack"><input type="hidden" name="tradeID" value="${e(editingTrade?.id??'')}"><label>股票代號<input name="symbol" list="asset-stock-identities" value="${e(prefillSymbol)}" autocomplete="off" required></label><datalist id="asset-stock-identities">${state.rows.map(r=>`<option value="${e(r.symbol)}" label="${e(r.name)}"></option>`).join('')}</datalist><label>股票名稱<input name="name" value="${e(prefillName||prefillSymbol)}" required></label><input type="hidden" name="type" value="${e(special?requestedSpecial:requestedType)}"><div class="segmented-control trade-side-control" role="group" aria-label="買入或賣出">${[['買入','買入'],['賣出','賣出']].map(([value,label])=>`<button type="button" data-trade-side="${value}" aria-pressed="${!special&&requestedType===value}">${label}</button>`).join('')}</div><details class="trade-other-type" ${special?'open':''}><summary>其他交易類型</summary><label>交易類別<select name="otherType" aria-label="其他交易類型">${assetTradeTypes.filter(type=>!['買入','賣出'].includes(type)).map(type=>`<option ${type===requestedSpecial?'selected':''}>${type}</option>`).join('')}</select></label></details><label>交易日期<input type="date" name="date" value="${e(editingTrade?.date??taipeiDay())}" required></label><label><span data-asset-quantity-label>成交股數（股）</span><input type="number" name="shares" step="any" value="${e(editingTrade?.shares??'')}" required></label><div data-asset-price-fields ${special?'hidden':''}>${['price','fee','tax'].map((key,i)=>`<label>${['成交單價（原始價格）','手續費','交易稅'][i]}<input type="number" name="${key}" min="0" step="any" value="${e(editingTrade?.[key]??(i?'0':''))}" ${special?'disabled':''} required></label>`).join('')}</div><label>幣別<input name="currency" value="${e(editingTrade?editingTrade.currency??'':'TWD')}" readonly aria-readonly="true"></label><label>備註<input name="notes" value="${e(editingTrade?.notes??'')}"></label><p class="muted" data-asset-type-note>${edit?'此處只更新本機交易帳本；舊幣別欄位保持原值，不會送出券商委託。':'此功能只記錄本機帳本，不會送出券商委託。'}</p><output id="asset-trade-preview" aria-live="polite">輸入後顯示交易現金流</output><button type="submit" class="primary" ${saving||saved?'disabled':''}>${saved?(edit?'交易已更新':'交易已儲存'):(edit?'更新交易':'儲存交易')}</button><p role="status" id="asset-save-status">${e(error)}</p></form>`);
  }
  if(id==='transactions'||id==='trade'){
   const tradeID=new URLSearchParams(location.hash.split('?')[1]||'').get('trade');const selected=ledger.trades.find(t=>String(t.id)===tradeID);let txs=ledger.trades.filter(t=>(!symbol||t.symbol===symbol)&&matchesAssetTradeFilter(t.type,kind)&&`${t.name} ${t.symbol}`.toLowerCase().includes(query.toLowerCase()));
   const cutoff=tradePeriod==='all'?null:tradePeriod==='3m'?3:tradePeriod==='1m'?1:12;const dateCutoff=cutoff?(()=>{const now=new Date(taipeiDay()+'T00:00:00Z');now.setUTCMonth(now.getUTCMonth()-cutoff);return now.toISOString().slice(0,10);})():null;
   if(id==='transactions'&&dateCutoff)txs=txs.filter(t=>t.date>=dateCutoff);txs.reverse();if(id==='trade')txs=selected?ledger.trades.filter(t=>t.symbol===selected.symbol).reverse():[];
   const controls=id==='transactions'?card('交易紀錄',`<div class="toolbar">${link('new-trade')}${link('import')}</div><div class="segmented-control transaction-filters" role="group" aria-label="交易紀錄篩選">${[['','全部'],['買入','買進'],['賣出','賣出'],['其他','其他交易']].map(([value,label])=>`<button type="button" data-transaction-filter="${value}" aria-pressed="${kind===value}">${label}</button>`).join('')}</div><form id="asset-transaction-filter" class="toolbar"><label>名稱或代號<input name="query" value="${e(query)}"></label><label>期間<select name="tradePeriod"><option value="1m" ${tradePeriod==='1m'?'selected':''}>近一個月</option><option value="3m" ${tradePeriod==='3m'?'selected':''}>近三個月</option><option value="12m" ${tradePeriod==='12m'?'selected':''}>近一年</option><option value="all" ${tradePeriod==='all'?'selected':''}>全部期間</option></select></label><button>套用</button></form>`):card('交易明細','<p class="muted">歷史成交價與目前市價分開顯示；下方列出同一股票全部交易。</p>');
   const detailSummary=id==='trade'&&selected?(()=>{const stock=tradeIdentity(selected),same=ledger.trades.filter(t=>t.symbol===selected.symbol),symbolLedger=assetLedger(same),position=symbolLedger.issues.length?null:symbolLedger.positions.find(p=>p.symbol===selected.symbol),quote=quotes.get(selected.symbol);return card(`${stock.name} ${stock.symbol}・持倉摘要`,facts([['目前持有股數',position?.shares],['持有成本（FIFO估算）',position?.basis],['目前市值（原始行情）',finite(quote?.price)&&position?quote.price*position.shares:null],['未實現損益（估算）',finite(quote?.price)&&position?quote.price*position.shares-position.basis:null],['同股交易筆數',same.length],['行情日期',state.index?.latest_daily_tw]])+(symbolLedger.issues.length?status('持倉估算待核對',symbolLedger.issues.join('；')):'' )+`<div class="toolbar"><a href="#/edit-trade?trade=${encodeURIComponent(String(selected.id))}">編輯這筆交易</a></div>`);})():'';
   const transactionContent=controls+detailSummary+(txs.length?txs.map(transactionCard).join(''):status('尚無符合的交易','新增交易、調整篩選或返回交易紀錄。'));
   return desktopRoute(transactionContent,'transactions');
  }
  const concentrations=value>0?[...rows].sort((a,b)=>b.value-a.value):[];
  const exposure=new Map();for(const r of rows){const label=r.sector||'分類資料不足';exposure.set(label,(exposure.get(label)||0)+(r.value??0));}
  const allocation=complete&&value>0?card('持股配置',concentrations.map(r=>`<div class="toolbar"><a class="grow" href="#/security?symbol=${encodeURIComponent(r.symbol)}">${e(r.name)} ${e(r.symbol)}</a>${favoriteButton(r.symbol,r.name,'asset-allocation-'+r.symbol)}<span>${percent(r.value/value*100)}</span></div><div class="allocation-bar"><i style="width:${r.value/value*100}%"></i></div>`).join('')):status('配置資料不足','請先核對交易與價格；不使用部分市值冒充完整配置。');
  if(id==='assets'&&desktop){
   const recent=ledger.trades.slice(-10).reverse(),chosen=recent.find(t=>t.index===selectedTrade)??recent[0];
   const colors=['#2463eb','#0d9488','#7c3aed','#d97706','#db2777','#64748b'];let offset=0;
   const realized=confirmed&&ledger.issues.length===0?ledger.positions.reduce((sum,p)=>sum+p.realized,0):null;
   const grouped=[...exposure].sort((a,b)=>b[1]-a[1]).map(([name,amount])=>({name,value:amount}));
   const allocationItems=allocationMode==='industry'?grouped:concentrations.map(row=>({name:`${row.name} ${row.symbol}`,value:row.value}));
   const allocationTotal=allocationItems.reduce((sum,item)=>sum+item.value,0);
   const chart=complete&&allocationTotal>0?`<svg viewBox="0 0 240 240" role="img" aria-label="資產配置市值佔比環圖"><g transform="rotate(-90 120 120)">${allocationItems.map((item,i)=>{const length=item.value/allocationTotal*100,start=offset;offset+=length;return `<circle cx="120" cy="120" r="84" fill="none" stroke="${colors[i%colors.length]}" stroke-width="28" pathLength="100" stroke-dasharray="${length} ${100-length}" stroke-dashoffset="${-start}"/>`;}).join('')}</g><text x="120" y="115" text-anchor="middle" fill="currentColor">持股市值</text><text x="120" y="141" text-anchor="middle" fill="currentColor">${n(value,0)} TWD</text></svg><ul class="d04-allocation-legend">${allocationItems.map((item,i)=>`<li><i style="--d04-color:${colors[i%colors.length]}"></i><span>${e(item.name)}</span><strong>${percent(item.value/allocationTotal*100)}</strong></li>`).join('')}</ul>`:status('配置資料不足','請先核對交易與價格；不使用部分市值冒充完整配置。');
   const treemap=complete&&grouped.length?`<div class="d04-treemap" role="img" aria-label="產業地圖（市值百分比）">${grouped.map(([name,amount],i)=>`<div style="flex-grow:${amount};--d04-color:${colors[i%colors.length]}"><strong>${e(name)}</strong><span>${percent(amount/value*100)}</span></div>`).join('')}</div>`:status('產業地圖資料不足','分類與完整持股市值確認後才顯示比例。');
   const holdingsHead=['名稱（代號）','股數','成本均價（元）','現價（元）','損益（元）','損益率（%）','市值（元）','佔比（%）'];
   const holdingsTable=`<div class="d04-table-scroll"><table class="d04-holdings-table" aria-label="持股明細"><thead><tr>${holdingsHead.map(label=>`<th scope="col">${label}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.map(row=>`<tr><th scope="row"><a href="#/security?symbol=${encodeURIComponent(row.symbol)}">${e(row.name)}（${e(row.symbol)}）</a> ${favoriteButton(row.symbol,row.name,'asset-holding-'+row.symbol)}</th><td>${n(row.shares)}</td><td>${n(row.cost)}</td><td>${finite(row.price)?n(row.price):'資料不足'}</td><td>${finite(row.pnl)?n(row.pnl):'資料不足'}</td><td>${finite(row.pnl)&&finite(row.basis)&&row.basis>0?percent(row.pnl/row.basis*100):'資料不足'}</td><td>${finite(row.value)?n(row.value):'資料不足'}</td><td>${complete&&value>0?percent(row.value/value*100):'資料不足'}</td></tr>`).join(''):`<tr><td colspan="8"><div class="d04-empty-row">${active.length?`上市狀態未確認，${active.length} 檔歷史持股暫不列入目前行情。`:'尚無股票資料；加入或匯入交易後，持股明細會顯示於此。'}</div></td></tr>`}</tbody></table></div><details class="d04-audit"><summary>核對交易與公司行為資料</summary>${settings()}</details>`;
   const tradeRows=recent.map(t=>{const stock=tradeIdentity(t),amount=['買入','賣出'].includes(t.type)?t.shares*t.price:t.type==='配息'?t.shares:null;return `<tr><td><button data-asset-select="${t.index}" aria-pressed="${chosen?.index===t.index}">${e(t.date||'日期待核對')}</button></td><th scope="row"><a href="#/security?symbol=${encodeURIComponent(stock.symbol)}">${e(stock.name)}（${e(stock.symbol)}）</a> ${favoriteButton(stock.symbol,stock.name,'asset-trade-'+stock.symbol)}</th><td>${e(t.type||'類型待核對')}</td><td>${n(t.shares)}</td><td>${['買入','賣出'].includes(t.type)?n(t.price):'—'}</td><td>${finite(amount)?`${n(amount)} ${t.currency||'TWD'}`:'資料不足'}</td><td>${e(t.notes||'—')}</td></tr>`;}).join('');
   const tradeTable=`<div class="toolbar">${link('new-trade')}${link('import')}</div><div class="d04-table-scroll"><table class="d04-trade-table" aria-label="交易紀錄最近 10 筆"><thead><tr>${['成交日期','名稱（代號）','交易別','股數','成交均價（元）','成交金額（元）','備註'].map(label=>`<th scope="col">${label}</th>`).join('')}</tr></thead><tbody>${tradeRows||'<tr><td colspan="7"><div class="d04-empty-row">尚無交易紀錄；可新增交易或匯入既有帳本。</div></td></tr>'}</tbody></table></div>`;
   const content=`<section class="desk-asset-holdings">${card(`持股明細（${active.length} 檔）`,holdingsTable)}</section><section class="desk-asset-allocation">${card('資產配置（市值佔比）',`<div class="segmented-control d04-allocation-tabs" role="group" aria-label="資產配置類別"><button type="button" data-d04-allocation-mode="industry" aria-pressed="${allocationMode==='industry'}">產業別</button><button type="button" data-d04-allocation-mode="stock" aria-pressed="${allocationMode==='stock'}">個股別</button></div>${chart}`)}${card('產業地圖（市值・%）',treemap)}</section><section class="desk-trades">${card('交易紀錄（最近 10 筆）',tradeTable)}</section><section class="desk-asset-detail" aria-label="所選交易明細">${chosen?transactionCard(chosen):status('交易明細','新增或匯入交易後，可在左側選擇查看。')}</section><section class="desk-asset-secondary-links" aria-label="其他資產分析">${card('其他分析',`${link('annual','歷年戰績')}${link('cashflow','現金流')}${link('simulation','投資模擬')}`)}</section>`;
   return warnings+desktopFrame(content,'holdings');
  }
  if(desktop&&id==='holdings')return warnings+desktopFrame(`<section class="d04-main-panel">${card(`持股明細（${active.length} 檔）`,rowList(rows,'holdings'))}${card('持股核對',settings())}</section>`,'holdings',true);
  if(desktop&&id==='allocation'){
   const groups=[...exposure].sort((a,b)=>b[1]-a[1]).map(([name,amount],i)=>({name,symbol:`industry-${i+1}`,value:amount}));
   const items=allocationMode==='industry'?groups:concentrations;
   const donut=complete&&value>0?allocationDonutMarkup(items,value,favoriteButton):status('配置資料不足','請先核對交易與 Public_Data 原始價格；不使用部分市值冒充完整配置。');
   const industryRows=complete&&value>0&&groups.length?groups.map(group=>`<div class="d04-industry-row"><span>${e(group.name)}</span><strong>${percent(group.value/value*100)}</strong><i><b style="width:${group.value/value*100}%"></b></i></div>`).join(''):status('產業地圖資料不足','分類與完整持股市值確認後才顯示比例。');
   return warnings+desktopFrame(`<section class="d04-main-panel">${card('資產配置（市值佔比）',`<div class="segmented-control d04-allocation-tabs" role="group" aria-label="資產配置類別"><button type="button" data-d04-allocation-mode="industry" aria-pressed="${allocationMode==='industry'}">產業別</button><button type="button" data-d04-allocation-mode="stock" aria-pressed="${allocationMode==='stock'}">個股別</button></div>${donut}`)}${card('產業地圖（市值・%）',`<div class="d04-treemap">${industryRows}</div>`)}${card('持股明細',rowList(rows,'holdings'))}</section>`,'allocation',true);
  }
  if(['assets','holdings','allocation'].includes(id)){
   let body=overview;if(id==='holdings')body+=rowList(rows,'holdings');
   if(id==='allocation')body=overview+(complete&&value>0?card('持股市值配置',allocationDonutMarkup(concentrations,value,favoriteButton)):status('配置資料不足','請先核對交易與價格；不使用部分市值冒充完整配置。'))+rowList(rows,'holdings')+card('產業分布',complete&&value>0?[...exposure].sort((a,b)=>b[1]-a[1]).map(([sector,amount])=>facts([[sector,percent(amount/value*100)]])).join(''):'資料不足');
  if(id==='assets'){const snapshot=readCashSnapshot();body+=card('手動現金快照（僅本頁估算）',`<form id="asset-cash-form" class="toolbar"><label>新臺幣現金<input name="cash" type="number" min="0" step="any" value="${e(cash)}" required></label><button>儲存現金快照</button></form><p role="status" class="${cashMessage?'alert':'muted'}">${e(cashMessage)}</p>${facts([['持股＋輸入現金',value!==null&&cash!==''&&Number(cash)>=0?value+Number(cash):null],['已儲存現金',snapshot?.amount??null],['快照日期',snapshot?.asOf??'尚未儲存']])}<p class="muted">快照保存在本機偏好與安全備份中；不會轉成交易，也不納入歷史績效。</p>`);}
   return settings()+warnings+`<div class="asset-workspace" data-asset-layout="${e(id)}">${body}</div>`;
  }
  if(id==='cashflow'||id==='annual'){
   const groups=new Map();for(const t of ledger.events){const key=t.date.slice(0,id==='annual'?4:7);const v=groups.get(key)??{buy:0,sell:0,dividend:0,realized:0,count:0};v.count++;if(t.type==='買入')v.buy-=t.flow;if(t.type==='賣出')v.sell+=t.flow;v.dividend+=t.dividend;v.realized+=t.realized;groups.set(key,v);}
   const chart=id==='cashflow'&&confirmed&&ledger.issues.length===0?card('每月現金流',cashflowChartMarkup(groups)):'';
   const report=settings()+card(id==='annual'?'年度已實現成果':'每月交易現金流',`<p class="muted">${notes} 買賣資金流不是報酬；股利依已入帳紀錄，不推算未來收入。</p>`)+chart+[...groups].sort((a,b)=>b[0].localeCompare(a[0])).map(([key,v])=>card(key,facts([['買入支出',confirmed?v.buy:null],['賣出收入',confirmed?v.sell:null],['已入帳股利',confirmed?v.dividend:null],['已實現損益估算',confirmed&&ledger.issues.length===0?v.realized:null],['買賣＋股利淨現金流',confirmed?v.sell+v.dividend-v.buy:null],['紀錄筆數',v.count]])+`<details><summary>檢視期間交易</summary>${ledger.trades.filter(t=>t.date?.startsWith(key)).map(transactionCard).join('')}</details>`)).join('')+(!groups.size?status('尚無交易資料','新增交易後可查看年度成果與每月入帳。'):'' );
   return desktopRoute(report,id==='annual'||id==='cashflow'?'performance':id);
  }
  const today=state.index?.latest_daily_tw||taipeiDay();if(!to)to=today;if(!from)from=new Date(Date.parse(to+'T00:00:00Z')-period*86400000).toISOString().slice(0,10);
  const controls=card('績效分析期間',`<form id="asset-period-form" class="toolbar"><label>起日<input name="from" type="date" value="${e(from)}" required></label><label>迄日<input name="to" type="date" value="${e(to)}" required></label><button>套用期間</button></form><p class="muted">僅股票部位；買賣及已入帳股利視為日末資金流，股利視為提領，不宣稱再投資。假設交易完整，不等同含現金帳戶淨值。</p>`);
  if(!confirmed||ledger.issues.length)return desktopRoute(settings()+controls+status('等待交易核對','完成同幣別及公司行為核對後計算歷史資料。'),id);
  if(!day(from)||!day(to)||from>=to)return desktopRoute(settings()+controls+status('期間不正確','迄日必須晚於起日。'),id);
  const needed=[...new Set(ledger.events.filter(t=>t.date<=to).map(t=>t.symbol))];
  if(needed.some(symbol=>!resolveListingStatus(symbol,taipeiDay(),state.listing).eligible))return desktopRoute(settings()+controls+status('完整歷史報酬資料不足','帳本包含目前上市資格未確認的證券；保留歷史交易，但不擅自排除後回報完整投資績效。'),id);
  if(historyDate!==state.index?.latest_daily_tw){histories.clear();historyDate=state.index?.latest_daily_tw;}
  const failures=[];await Promise.all(needed.map(async symbol=>{if(!histories.has(symbol)){try{histories.set(symbol,rawHistory(await publicData(`rebuild/charts/${encodeURIComponent(symbol)}.json`),symbol));}catch{failures.push(symbol);}}}));
  const history=assetHistory(raw,histories,from,to),first=history.points[0],last=history.points.at(-1);
  if(failures.length)return desktopRoute(settings()+controls+status('歷史價格載入失敗',`${failures.join('、')}：請稍後重試。`,'!',true),id);
  const flow=first&&last?ledger.events.filter(t=>t.date>first.date&&t.date<=last.date).map(t=>({date:t.date,value:t.flow})):[];
  const irr=history.valid&&first&&last?moneyWeightedReturn([{date:first.date,value:-first.value},...flow,{date:last.date,value:last.value}]):null;
  const report=card(id==='risk'?'風險指標':'報酬率明細',facts([['區間報酬估算',percent(history.totalReturn)],['年化報酬（至少一年）',percent(history.annualReturn)],['年化金額加權報酬 XIRR',percent(irr)],['年化波動（252 日，至少20筆）',percent(history.volatility)],['最大回撤',percent(history.drawdown)],['有效日報酬筆數',history.observations],['缺漏估值／無基數區間',history.missing],['實際資料起日',first?.date],['實際資料迄日',last?.date],['期初持股市值',first?.value],['期末持股市值',last?.value]]));
  const chart=card('資金流調整報酬指數（起點100）',history.valid?line(history.points,'index','資金流調整報酬指數'):status('完整曲線資料不足','部分日期無完整原始收盤價或期初無持股基數；不連線跨越缺口。'));
  const concentration=card('持股集中度',facts([3,5,10].map(count=>[`前 ${count} 大持股`,value>0?percent(concentrations.slice(0,count).reduce((s,r)=>s+r.value,0)/value*100):'資料不足'])));
  return desktopRoute(settings()+controls+report+chart+concentration+card('計算來源與限制','<p class="muted">價格：Public_Data rebuild/charts.close（日末原始價格）。未以前收或還原價補洞；未使用 charts.open 作執行價。期間有缺漏則區間報酬及風險不發布。XIRR 僅回報搜尋範圍內唯一根，否則資料不足。夏普值與大盤超額報酬需要一致總報酬基準及無風險利率，尚未提供。</p>'),id);
 }
 function listen(app){
  app.addEventListener('input',ev=>{const form=ev.target.form;if(form?.id!=='asset-trade-form')return;if(ev.target.name==='name'){ev.target.dataset.autofilled='false';return;}if(ev.target.name==='symbol'){const name=form.elements.name,symbol=ev.target.value.trim().toUpperCase();if(form.dataset.lastSymbol===symbol)return;form.dataset.lastSymbol=symbol;name.value=tradeIdentity({symbol}).name;name.dataset.autofilled='true';}});
  app.addEventListener('click',async ev=>{const allocationTab=ev.target.closest('[data-d04-allocation-mode]');if(allocationTab){allocationMode=allocationTab.dataset.d04AllocationMode==='stock'?'stock':'industry';await ctx.refresh();return;}const filter=ev.target.closest('[data-transaction-filter]');if(filter){kind=filter.dataset.transactionFilter;await ctx.refresh();return;}const summary=ev.target.closest('.trade-other-type > summary');if(summary){ev.preventDefault();const details=summary.parentElement,form=summary.closest('form');details.open=!details.open;if(details.open){form.elements.type.value=form.elements.otherType.value;form.querySelectorAll('[data-trade-side]').forEach(button=>button.setAttribute('aria-pressed','false'));updatePreview(form);}return;}const side=ev.target.closest('[data-trade-side]');if(side){const form=side.closest('form'),type=side.dataset.tradeSide;form.elements.type.value=type;form.querySelectorAll('[data-trade-side]').forEach(button=>button.setAttribute('aria-pressed',String(button===side)));form.querySelector('.trade-other-type').open=false;updatePreview(form);return;}const button=ev.target.closest('[data-asset-select]');if(button){selectedTrade=Number(button.dataset.assetSelect);await ctx.refresh();}});
  app.addEventListener('change',ev=>{if(ev.target.id==='asset-confirm'){confirmed=ev.target.checked;ctx.refresh();}if(ev.target.name==='tradePeriod'){tradePeriod=String(ev.target.value);ctx.refresh();}if(ev.target.name==='otherType'){const form=ev.target.form;form.elements.type.value=ev.target.value;form.querySelectorAll('[data-trade-side]').forEach(button=>button.setAttribute('aria-pressed','false'));updatePreview(form);}if(ev.target.closest('#asset-trade-form'))updatePreview(ev.target.closest('form'));});
  app.addEventListener('input',ev=>{const f=ev.target.closest('#asset-trade-form');if(f)updatePreview(f);});
  app.addEventListener('submit',async ev=>{
   const f=ev.target;if(!['asset-period-form','asset-cash-form','asset-transaction-filter','asset-trade-form'].includes(f.id))return;ev.preventDefault();const d=new FormData(f);
   if(f.id==='asset-period-form'){from=String(d.get('from'));to=String(d.get('to'));ctx.refresh();}
   if(f.id==='asset-cash-form'){cash=String(d.get('cash'));const amount=Number(cash);if(Number.isFinite(amount)&&amount>=0){try{localStorage.setItem(cashSnapshotKey,JSON.stringify({amount,asOf:taipeiDay()}));cashMessage='現金快照已保存。';}catch{cashMessage='現金快照無法保存在本機；既有快照已保留。';}ctx.refresh();}}
   if(f.id==='asset-transaction-filter'){query=String(d.get('query'));tradePeriod=String(d.get('tradePeriod')||tradePeriod);ctx.refresh();}
   if(f.id==='asset-trade-form'&&!saving&&!saved){
    const type=String(d.get('type')),special=['配息','配股','拆股'].includes(type),tradeID=String(d.get('tradeID')||''),row={type,date:String(d.get('date')),symbol:String(d.get('symbol')).trim().toUpperCase(),name:String(d.get('name')).trim(),shares:Number(d.get('shares')),price:special?0:Number(d.get('price')),fee:special?0:Number(d.get('fee')),tax:special?0:Number(d.get('tax')),notes:String(d.get('notes')),isManualValue:true};const currency=String(d.get('currency')||'');if(currency)row.currency=currency;else if(!tradeID)row.currency='TWD';
    const feedback=f.querySelector('#asset-save-status');if(!row.name||!normalizeAssetTrade(row).valid){feedback.textContent='請核對名稱、日期、股數與非負稅費。拆股填股數增減，不填比例。';return;}
    const submitButton=f.querySelector('button[type="submit"]');saving=true;submitButton.disabled=true;try{const old=await readTrades();if(tradeID){const replacement=prepareAssetTradeReplacement(old,row,tradeID);await replaceTrade(replacement.row,replacement.expected);saved=true;feedback.textContent='交易已更新；原始紀錄已驗證讀回。';submitButton.textContent='交易已更新';}else{const proposed=assetLedger([...old,row]);if(proposed.issues.length>assetLedger(old).issues.length)throw Error(proposed.issues.at(-1));await appendTrades([row]);saved=true;feedback.textContent='交易已儲存；原始紀錄保留。';submitButton.textContent='交易已儲存';}}catch(err){feedback.textContent=err.message;submitButton.disabled=false;}finally{saving=false;}
   }
  });
 }
 function updatePreview(f){const d=new FormData(f),type=String(d.get('type')),special=['配息','配股','拆股'].includes(type);f.querySelector('[data-asset-price-fields]').hidden=special;f.querySelectorAll('[data-asset-price-fields] input').forEach(i=>i.disabled=special);f.querySelector('[data-asset-quantity-label]').textContent=type==='配息'?'入帳金額（TWD）':type==='拆股'?'股數增減（增股填正數、減股填負數）':type==='配股'?'配發股數':'成交股數（股）';const q=Number(d.get('shares')),p=Number(d.get('price')),fee=Number(d.get('fee')),tax=Number(d.get('tax')),gross=q*p,costs=fee+tax,amount=type==='配息'?q:type==='買入'?-(gross+costs):type==='賣出'?gross-costs:0;f.querySelector('#asset-trade-preview').textContent=['配股','拆股'].includes(type)?`股數調整：${n(q)} 股 · 不產生現金流`:type==='配息'?`股利入帳：${n(q)} TWD`: `成交金額：${n(gross)} TWD · 手續費與交易稅：${n(costs)} TWD · 現金流：${n(amount)} TWD`;f.querySelector('[data-asset-type-note]').textContent=type==='拆股'?'拆股填新增或減少股數，不填倍數；總成本保留，不是買賣。':type==='配息'?'填新臺幣實際入帳金額，不乘股價或再扣稅費。':'不會送出券商委託；此帳本表單以新臺幣（TWD）記錄。';}
 return {page,listen};
}
