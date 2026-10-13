import {number as n,escapeHTML as e,taipeiDay,resolveListingStatus,identity} from './core.mjs';
import {readTrades,appendTrades} from './storage.mjs';
export const assetTradeTypes=['買入','賣出','配息','配股','拆股'];
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
 return {id:raw.id??index,index,symbol,name,type,shares,price,fee,tax,date,valid,notes:String(raw.notes??''),raw};
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
const notes='FIFO 交易估算，買入含輸入稅費；配股與拆股依增減股數攤平原成本。只讀既有交易，不改写來源。';
export function createAssetsModule(ctx){
 const {state,card,metric,status,rowList,link,publicData}=ctx;let confirmed=false,from='',to='',period=365,kind='',query='',cash=String(readCashSnapshot()?.amount??''),cashMessage='',error='',saving=false,saved=false,selectedTrade=null,lastPage='',historyDate='';
 const histories=new Map();
 const facts=items=>`<div class="metric-grid">${items.map(([k,v])=>metric(k,typeof v==='number'?n(v):e(v??'資料不足'))).join('')}</div>`;
 const tradeIdentity=t=>{const symbol=String(t.symbol??t.stock_id??'').trim();const rawName=String(t.name??t.stockName??'').trim();return identity(symbol,rawName&&rawName!==symbol?{name:rawName}:null,state.rows.find(row=>row.symbol===symbol),state.listing?.stocks?.[symbol]);};
 const percent=v=>finite(v)?n(v)+'%':'資料不足';
 const line=(points,key,label)=>{
  const valid=points.filter(p=>finite(p[key]));if(valid.length<2)return status('圖表資料不足','至少需要兩筆完整日末估值。');const values=valid.map(p=>p[key]),min=Math.min(...values),max=Math.max(...values),range=max-min||1;
  return `<svg viewBox="0 0 720 220" role="img" aria-label="${e(label)}"><line x1="30" y1="190" x2="700" y2="190" stroke="var(--line)"/><polyline fill="none" stroke="var(--blue)" stroke-width="3" points="${valid.map((p,i)=>`${30+i/(valid.length-1)*670},${180-(p[key]-min)/range*155}`).join(' ')}"/><text x="30" y="18" fill="currentColor">${n(max)}</text><text x="30" y="215" fill="currentColor">${e(valid[0].date)}</text><text x="700" y="215" text-anchor="end" fill="currentColor">${e(valid.at(-1).date)}</text></svg>`;
 };
 const settings=()=>card('分析範圍',`<label><input id="asset-confirm" type="checkbox" ${confirmed?'checked':''}>我已核對本帳本全部交易為新臺幣，且已補齊配息、配股與拆股</label><p class="muted">原始交易沒有完整幣別與帳戶現金欄位。確認前只列個別紀錄；不混算多幣別。確認不會修改交易。</p>`);
 const transactionCard=t=>{const stock=tradeIdentity(t);return card(`${stock.name} ${stock.symbol}`,`${rowList([{...t,...stock,price:['買入','賣出'].includes(t.type)?t.price:null}],'asset-transactions')}<div class="toolbar"><strong>${e(t.type||'未知類型')}</strong><span>${e(t.date||'日期待核對')}</span><a href="#/trade?trade=${encodeURIComponent(String(t.id))}">交易明細</a></div>${facts([[t.type==='配息'?'入帳金額（原交易幣別）':t.type==='拆股'?'股數增減（非拆股比例）':'股數',t.shares],['歷史成交價',['買入','賣出'].includes(t.type)?t.price:'不適用'],['手續費',t.fee],['交易稅',t.tax]])}<p class="muted">${e(t.notes)}</p>${t.valid?'':status('紀錄待核對','不符合分析格式；原始資料已保留。')}`);};
 async function page(id,symbol){
  if(!['assets','holdings','allocation','risk','performance','annual','cashflow','transactions','trade','new-trade'].includes(id))return null;
  if(id!==lastPage){if(id==='new-trade'){saved=false;error='';}lastPage=id;}
  const raw=await readTrades(),ledger=assetLedger(raw),eligible=p=>resolveListingStatus(p.symbol,taipeiDay(),state.listing).eligible;
  const active=ledger.positions.filter(p=>p.shares>1e-8),quotes=new Map(state.rows.map(q=>[q.symbol,q]));
  const rows=active.filter(eligible).map(p=>{const q=quotes.get(p.symbol);return {...q,...p,name:q?.name||p.name,price:q?.price??null,cost:p.basis/p.shares,value:finite(q?.price)?q.price*p.shares:null,pnl:finite(q?.price)?q.price*p.shares-p.basis:null};});
  const complete=confirmed&&ledger.issues.length===0&&rows.length===active.length&&rows.every(r=>finite(r.value))&&finite(rows.reduce((sum,r)=>sum+r.value,0))&&finite(rows.reduce((sum,r)=>sum+r.basis,0));
  const value=complete?rows.reduce((s,r)=>s+r.value,0):null,basis=complete?rows.reduce((s,r)=>s+r.basis,0):null,pnl=value!==null?value-basis:null;
  const warnings=ledger.issues.map(m=>status('交易核對',m,'!')).join('')+(active.length!==rows.length?status('部分持股未計價',`${active.length-rows.length} 檔尚未通過目前上市資格；歷史紀錄保留，完整總額不以部分合計代替。`,'!'):'');
  const overview=card('持股市值・TWD',`<div class="hero-value">${n(value,0)}</div>${facts([['未實現損益',pnl],['持股成本',basis],['行情日期',state.index?.latest_daily_tw],['持股檔數',active.length]])}<p class="muted">原始市場價格；不含未記錄現金、待交割款或未知證券。${notes}</p>`);
  if(id==='new-trade')return card('新增交易',`<form id="asset-trade-form" class="stack"><label>股票代號<input name="symbol" list="asset-stock-identities" autocomplete="off" required></label><datalist id="asset-stock-identities">${state.rows.map(r=>`<option value="${e(r.symbol)}" label="${e(r.name)}"></option>`).join('')}</datalist><label>股票名稱<input name="name" required></label><label>交易類別<select name="type">${assetTradeTypes.map(t=>`<option>${t}</option>`).join('')}</select></label><label>交易日期<input type="date" name="date" value="${taipeiDay()}" required></label><label><span data-asset-quantity-label>成交股數（股）</span><input type="number" name="shares" step="any" required></label><div data-asset-price-fields>${['price','fee','tax'].map((key,i)=>`<label>${['成交單價（原始價格）','手續費','交易稅'][i]}<input type="number" name="${key}" min="0" step="any" value="${i?'0':''}" required></label>`).join('')}</div><label>備註<input name="notes"></label><p class="muted" data-asset-type-note>交易幣別沿用原帳本；不自動換匯。金額依實際輸入稅費保存。</p><output id="asset-trade-preview" aria-live="polite">輸入後顯示交易現金流</output><button class="primary" ${saving||saved?'disabled':''}>${saved?'交易已儲存':'儲存交易'}</button><p role="status" id="asset-save-status">${e(error)}</p></form>`);
  if(id==='transactions'||id==='trade'){
   const tradeID=new URLSearchParams(location.hash.split('?')[1]||'').get('trade');let txs=ledger.trades.filter(t=>(!symbol||t.symbol===symbol)&&(!kind||t.type===kind)&&`${t.name} ${t.symbol}`.includes(query)).reverse();if(id==='trade')txs=txs.filter(t=>String(t.id)===tradeID);
   const controls=id==='transactions'?card('交易紀錄',`<div class="toolbar">${link('new-trade')}${link('import')}</div><form id="asset-transaction-filter" class="toolbar"><label>名稱或代號<input name="query" value="${e(query)}"></label><label>類別<select name="kind"><option value="">全部</option>${assetTradeTypes.map(t=>`<option ${kind===t?'selected':''}>${t}</option>`).join('')}</select></label><button>套用</button></form>`):card('交易明細','<p class="muted">原交易幣別，歷史成交價；歷史下市證券亦保留。</p>');
   return controls+(txs.length?txs.map(transactionCard).join(''):status('尚無符合的交易','新增交易、調整篩選或返回交易紀錄。'));
  }
  const directory=card('資產管理',['holdings','allocation','risk','cashflow','performance','annual','simulation','transactions','new-trade','import'].map(id=>link(id)).join(''));
  const concentrations=value>0?[...rows].sort((a,b)=>b.value-a.value):[];
  const exposure=new Map();for(const r of rows){const label=r.sector||'分類資料不足';exposure.set(label,(exposure.get(label)||0)+(r.value??0));}
  const allocation=complete&&value>0?card('持股配置',concentrations.map(r=>`<div class="toolbar"><a class="grow" href="#/security?symbol=${encodeURIComponent(r.symbol)}">${e(r.name)} ${e(r.symbol)}</a><span>${percent(r.value/value*100)}</span></div><div class="allocation-bar"><i style="width:${r.value/value*100}%"></i></div>`).join('')):status('配置資料不足','請先核對交易與價格；不使用部分市值冒充完整配置。');
  if(id==='assets'&&matchMedia('(min-width: 1100px)').matches){
   const recent=ledger.trades.slice(-10).reverse(),chosen=recent.find(t=>t.index===selectedTrade)??recent[0];
   const colors=['#2463eb','#0d9488','#7c3aed','#d97706','#db2777','#64748b'];let offset=0;
   const chart=complete&&value>0?`<svg viewBox="0 0 240 240" role="img" aria-label="持股市值配置；各股票比例見下方清單"><g transform="rotate(-90 120 120)">${concentrations.map((r,i)=>{const length=r.value/value*100,start=offset;offset+=length;return `<circle cx="120" cy="120" r="84" fill="none" stroke="${colors[i%colors.length]}" stroke-width="28" pathLength="100" stroke-dasharray="${length} ${100-length}" stroke-dashoffset="${-start}"/>`;}).join('')}</g><text x="120" y="115" text-anchor="middle" fill="currentColor">持股市值 TWD</text><text x="120" y="141" text-anchor="middle" fill="currentColor">${n(value,0)}</text></svg>`:'';
   const realized=confirmed&&ledger.issues.length===0?ledger.positions.reduce((sum,p)=>sum+p.realized,0):null;
   return settings()+warnings+`<div class="desktop-page desktop-assets"><section class="desk-asset-summary">${card('資產摘要',facts([['持股市值 TWD',value],['未實現損益',pnl],['已實現損益估算',finite(realized)?realized:null],['持股成本',basis],['持股檔數',active.length],['行情日期',state.index?.latest_daily_tw]])+`<p class="muted">${notes} 帳戶現金與待交割款未完整記錄，不冒充帳戶總資產。</p>`)}</section><nav class="desk-asset-nav toolbar" aria-label="資產分析">${['holdings','allocation','risk','performance','annual','transactions'].map(id=>link(id)).join('')}</nav><section>${card('持股明細',rowList(rows,'holdings'))}</section><section>${card('市值配置',chart)}${allocation}${card('產業曝險',complete&&value>0?[...exposure].sort((a,b)=>b[1]-a[1]).map(([sector,amount])=>`<p>${e(sector)} ${percent(amount/value*100)}</p><div class="allocation-bar"><i style="width:${amount/value*100}%"></i></div>`).join(''):'資料不足')}</section><section class="desk-trades">${card('近期交易・最近10筆',`<div class="toolbar">${link('new-trade')}${link('import')}</div>`+recent.map(t=>{const stock=tradeIdentity(t);return `<button data-asset-select="${t.index}" aria-pressed="${chosen?.index===t.index}"><strong>${e(stock.name)} ${e(stock.symbol)}</strong><span> · ${e(t.date)} · ${e(t.type)} · ${n(t.shares)}${t.type==='配息'?'（入帳金額）':' 股'}</span></button>`;}).join('')+(recent.length?'':'尚無交易紀錄'))}</section><section aria-label="所選交易明細">${chosen?transactionCard(chosen):status('交易明細','新增或匯入交易後，可在左側選擇查看。')}</section></div>`;
  }
  if(['assets','holdings','allocation'].includes(id)){
   let body=overview+allocation+rowList(rows,'holdings');
   if(id==='allocation')body+=card('產業分布',complete&&value>0?[...exposure].sort((a,b)=>b[1]-a[1]).map(([sector,amount])=>facts([[sector,percent(amount/value*100)]])).join(''):'資料不足');
  if(id==='assets'){const snapshot=readCashSnapshot();body+=card('手動現金快照（僅本頁估算）',`<form id="asset-cash-form" class="toolbar"><label>新臺幣現金<input name="cash" type="number" min="0" step="any" value="${e(cash)}" required></label><button>儲存現金快照</button></form><p role="status" class="${cashMessage?'alert':'muted'}">${e(cashMessage)}</p>${facts([['持股＋輸入現金',value!==null&&cash!==''&&Number(cash)>=0?value+Number(cash):null],['已儲存現金',snapshot?.amount??null],['快照日期',snapshot?.asOf??'尚未儲存']])}<p class="muted">快照保存在本機偏好與安全備份中；不會轉成交易，也不納入歷史績效。</p>`)+directory+card('近期交易',ledger.trades.slice(-5).reverse().map(transactionCard).join('')||'尚無交易');}
   return settings()+warnings+`<div class="asset-workspace" data-asset-layout="${e(id)}">${body}</div>`;
  }
  if(id==='cashflow'||id==='annual'){
   const groups=new Map();for(const t of ledger.events){const key=t.date.slice(0,id==='annual'?4:7);const v=groups.get(key)??{buy:0,sell:0,dividend:0,realized:0,count:0};v.count++;if(t.type==='買入')v.buy-=t.flow;if(t.type==='賣出')v.sell+=t.flow;v.dividend+=t.dividend;v.realized+=t.realized;groups.set(key,v);}
   return settings()+warnings+card(id==='annual'?'年度已實現成果':'每月交易現金流',`<p class="muted">${notes} 買賣資金流不是報酬；股利依已入帳紀錄，不推算未來收入。</p>`)+[...groups].sort((a,b)=>b[0].localeCompare(a[0])).map(([key,v])=>card(key,facts([['買入支出',confirmed?v.buy:null],['賣出收入',confirmed?v.sell:null],['已入帳股利',confirmed?v.dividend:null],['已實現損益估算',confirmed&&ledger.issues.length===0?v.realized:null],['買賣＋股利淨現金流',confirmed?v.sell+v.dividend-v.buy:null],['紀錄筆數',v.count]])+`<details><summary>檢視期間交易</summary>${ledger.trades.filter(t=>t.date?.startsWith(key)).map(transactionCard).join('')}</details>`)).join('')+(!groups.size?status('尚無交易資料','新增交易後可查看年度成果與每月入帳。'):'');
  }
  const today=state.index?.latest_daily_tw||taipeiDay();if(!to)to=today;if(!from)from=new Date(Date.parse(to+'T00:00:00Z')-period*86400000).toISOString().slice(0,10);
  const controls=card('績效分析期間',`<form id="asset-period-form" class="toolbar"><label>起日<input name="from" type="date" value="${e(from)}" required></label><label>迄日<input name="to" type="date" value="${e(to)}" required></label><button>套用期間</button></form><p class="muted">僅股票部位；買賣及已入帳股利視為日末資金流，股利視為提領，不宣稱再投資。假設交易完整，不等同含現金帳戶淨值。</p>`);
  if(!confirmed||ledger.issues.length)return settings()+warnings+controls+status('等待交易核對','完成同幣別及公司行為核對後計算歷史資料。');
  if(!day(from)||!day(to)||from>=to)return settings()+controls+status('期間不正確','迄日必須晚於起日。');
  const needed=[...new Set(ledger.events.filter(t=>t.date<=to).map(t=>t.symbol))];
  if(needed.some(symbol=>!resolveListingStatus(symbol,taipeiDay(),state.listing).eligible))return settings()+controls+status('完整歷史報酬資料不足','帳本包含目前上市資格未確認的證券；保留歷史交易，但不擅自排除後回報完整投資績效。');
  if(historyDate!==state.index?.latest_daily_tw){histories.clear();historyDate=state.index?.latest_daily_tw;}
  const failures=[];await Promise.all(needed.map(async symbol=>{if(!histories.has(symbol)){try{histories.set(symbol,rawHistory(await publicData(`rebuild/charts/${encodeURIComponent(symbol)}.json`),symbol));}catch{failures.push(symbol);}}}));
  const history=assetHistory(raw,histories,from,to),first=history.points[0],last=history.points.at(-1);
  if(failures.length)return settings()+controls+status('歷史價格載入失敗',`${failures.join('、')}：請稍後重試。`,'!',true);
  const flow=first&&last?ledger.events.filter(t=>t.date>first.date&&t.date<=last.date).map(t=>({date:t.date,value:t.flow})):[];
  const irr=history.valid&&first&&last?moneyWeightedReturn([{date:first.date,value:-first.value},...flow,{date:last.date,value:last.value}]):null;
  const report=card(id==='risk'?'風險指標':'報酬率明細',facts([['區間報酬估算',percent(history.totalReturn)],['年化報酬（至少一年）',percent(history.annualReturn)],['年化金額加權報酬 XIRR',percent(irr)],['年化波動（252 日，至少20筆）',percent(history.volatility)],['最大回撤',percent(history.drawdown)],['有效日報酬筆數',history.observations],['缺漏估值／無基數區間',history.missing],['實際資料起日',first?.date],['實際資料迄日',last?.date],['期初持股市值',first?.value],['期末持股市值',last?.value]]));
  const chart=card('資金流調整報酬指數（起點100）',history.valid?line(history.points,'index','資金流調整報酬指數'):status('完整曲線資料不足','部分日期無完整原始收盤價或期初無持股基數；不連線跨越缺口。'));
  const concentration=card('持股集中度',facts([3,5,10].map(count=>[`前 ${count} 大持股`,value>0?percent(concentrations.slice(0,count).reduce((s,r)=>s+r.value,0)/value*100):'資料不足'])));
  return settings()+warnings+controls+report+chart+concentration+card('計算來源與限制','<p class="muted">價格：Public_Data rebuild/charts.close（日末原始價格）。未以前收或還原價補洞；未使用 charts.open 作執行價。期間有缺漏則區間報酬及風險不發布。XIRR 僅回報搜尋範圍內唯一根，否則資料不足。夏普值與大盤超額報酬需要一致總報酬基準及無風險利率，尚未提供。</p>');
 }
 function listen(app){
  app.addEventListener('input',ev=>{const form=ev.target.form;if(form?.id!=='asset-trade-form')return;if(ev.target.name==='name'){ev.target.dataset.autofilled='false';return;}if(ev.target.name==='symbol'){const name=form.elements.name,symbol=ev.target.value.trim().toUpperCase();if(form.dataset.lastSymbol===symbol)return;form.dataset.lastSymbol=symbol;const match=state.rows.find(row=>row.symbol===symbol);if(match){name.value=match.name;name.dataset.autofilled='true';}else{name.value='';name.dataset.autofilled='false';}}});
  app.addEventListener('click',async ev=>{const button=ev.target.closest('[data-asset-select]');if(button){selectedTrade=Number(button.dataset.assetSelect);await ctx.refresh();}});
  app.addEventListener('change',ev=>{if(ev.target.id==='asset-confirm'){confirmed=ev.target.checked;ctx.refresh();}if(ev.target.closest('#asset-trade-form'))updatePreview(ev.target.closest('form'));});
  app.addEventListener('input',ev=>{const f=ev.target.closest('#asset-trade-form');if(f)updatePreview(f);});
  app.addEventListener('submit',async ev=>{
   const f=ev.target;if(!['asset-period-form','asset-cash-form','asset-transaction-filter','asset-trade-form'].includes(f.id))return;ev.preventDefault();const d=new FormData(f);
   if(f.id==='asset-period-form'){from=String(d.get('from'));to=String(d.get('to'));ctx.refresh();}
   if(f.id==='asset-cash-form'){cash=String(d.get('cash'));const amount=Number(cash);if(Number.isFinite(amount)&&amount>=0){try{localStorage.setItem(cashSnapshotKey,JSON.stringify({amount,asOf:taipeiDay()}));cashMessage='現金快照已保存。';}catch{cashMessage='現金快照無法保存在本機；既有快照已保留。';}ctx.refresh();}}
   if(f.id==='asset-transaction-filter'){query=String(d.get('query'));kind=String(d.get('kind'));ctx.refresh();}
   if(f.id==='asset-trade-form'&&!saving&&!saved){
    const type=String(d.get('type')),special=['配息','配股','拆股'].includes(type),row={type,date:String(d.get('date')),symbol:String(d.get('symbol')).trim().toUpperCase(),name:String(d.get('name')).trim(),shares:Number(d.get('shares')),price:special?0:Number(d.get('price')),fee:special?0:Number(d.get('fee')),tax:special?0:Number(d.get('tax')),notes:String(d.get('notes')),isManualValue:true};
    const feedback=f.querySelector('#asset-save-status');if(!row.name||!normalizeAssetTrade(row).valid){feedback.textContent='請核對名稱、日期、股數與非負稅費。拆股填股數增減，不填比例。';return;}
    saving=true;f.querySelector('button').disabled=true;try{const old=await readTrades(),proposed=assetLedger([...old,row]);if(proposed.issues.length>assetLedger(old).issues.length)throw Error(proposed.issues.at(-1));await appendTrades([row]);saved=true;feedback.textContent='交易已儲存；原始紀錄保留。';f.querySelector('button').textContent='交易已儲存';}catch(err){feedback.textContent=err.message;f.querySelector('button').disabled=false;}finally{saving=false;}
   }
  });
 }
 function updatePreview(f){const d=new FormData(f),type=String(d.get('type')),special=['配息','配股','拆股'].includes(type);f.querySelector('[data-asset-price-fields]').hidden=special;f.querySelectorAll('[data-asset-price-fields] input').forEach(i=>i.disabled=special);f.querySelector('[data-asset-quantity-label]').textContent=type==='配息'?'入帳金額（原交易幣別）':type==='拆股'?'股數增減（增股填正數、減股填負數）':type==='配股'?'配發股數':'成交股數（股）';const q=Number(d.get('shares')),p=Number(d.get('price')),fee=Number(d.get('fee')),tax=Number(d.get('tax'));const amount=type==='配息'?q:type==='買入'?-(q*p+fee+tax):type==='賣出'?q*p-fee-tax:0;f.querySelector('#asset-trade-preview').textContent=`交易現金流：${n(amount)}（原交易幣別）`;f.querySelector('[data-asset-type-note]').textContent=type==='拆股'?'拆股填新增或減少股數，不填倍數；總成本保留，不是買賣。':type==='配息'?'填實際入帳金額，不乘股價或再扣稅費。':'交易幣別沿用原帳本；不自動換匯。';}
 return {page,listen};
}
