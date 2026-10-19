import {escapeHTML as e,number as n,resolveListingStatus,taipeiDay,compareCodepoints,identity} from './core.mjs';
export function createETFUnitFlows(ctx){
 const {state,card,status,publicData,favoriteButton=()=>''}=ctx;let direction='all',selectedDate='',selectedMonth='',mode='daily';
 const validDay=day=>typeof day==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(day)&&Number.isFinite(Date.parse(day+'T00:00:00Z'))&&new Date(day+'T00:00:00Z').toISOString().slice(0,10)===day;
 const validTimestamp=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/.test(value)&&validDay(value.slice(0,10))&&Number.isFinite(Date.parse(value));
 function validSnapshot(snapshot){
  const c=snapshot.coverage,funds=snapshot.funds;
  if(!c||!Array.isArray(funds)||!Number.isSafeInteger(c.expectedFunds)||!Number.isSafeInteger(c.availableFunds)||!Number.isSafeInteger(c.unavailableFunds)||!Number.isSafeInteger(c.conflictingDuplicateSymbols)||c.expectedFunds<0||c.availableFunds<0||c.unavailableFunds<0||c.conflictingDuplicateSymbols<0||c.availableFunds>c.expectedFunds||c.unavailableFunds!==c.expectedFunds-c.availableFunds||c.conflictingDuplicateSymbols>c.expectedFunds||funds.length!==c.expectedFunds||snapshot.complete!==(c.availableFunds===c.expectedFunds)||!validTimestamp(snapshot.generatedAt))return false;
  const symbols=funds.map(x=>x?.symbol);
  if(symbols.some(x=>typeof x!=='string'||!x.trim()||x!==x.trim())||new Set(symbols).size!==symbols.length)return false;
  const available=funds.filter(x=>x?.status==='AVAILABLE'),unavailable=funds.filter(x=>x?.status==='UNAVAILABLE');
  return available.length===c.availableFunds&&unavailable.length===c.unavailableFunds&&available.every(x=>Number.isSafeInteger(x.issuedUnits)&&x.issuedUnits>=0&&Number.isSafeInteger(x.issuedUnitChange)&&Number.isFinite(x.previousBusinessDayNAV)&&x.previousBusinessDayNAV>0&&Number.isFinite(x.estimatedNetAssetChangeTWD)&&x.sourceDate===snapshot.date&&typeof x.sourceTime==='string'&&/^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(x.sourceTime)&&x.sourceTime>='13:30:00'&&x.unavailableReason==null)&&unavailable.every(x=>typeof x.unavailableReason==='string'&&x.unavailableReason.trim())&&funds.every(x=>x?.status==='AVAILABLE'||x?.status==='UNAVAILABLE');
 }
 function present(row){
  const security=identity(row.symbol,row,state.listing?.stocks?.[row.symbol]);
  const displayName=security.name;
  const delta=Number(row.estimatedNetAssetChangeTWD),units=Number(row.issuedUnitChange);
  const amount=Number.isFinite(delta)?`${delta>0?'+':''}${n(delta/100000000)} 億元`:'資料不足';
  const unitText=Number.isSafeInteger(units)?`${units>0?'+':''}${n(units,0)} 單位`:'資料不足';
  const tone=Number.isFinite(delta)?(delta>0?'up':delta<0?'down':'') : '';
  return card('',`<a class="directory-link" href="#/etf?symbol=${encodeURIComponent(security.symbol)}" aria-label="${e(displayName)} ${e(security.symbol)}，查看基金資訊"><span class="identity"><strong>${e(displayName)}</strong><span>${e(security.symbol||'資料不足')}</span></span><span aria-hidden="true">›</span></a>${favoriteButton(row.symbol,displayName,'etf-flow-'+row.symbol)}<div class="metric-grid">${ctx.metric('受益單位增減',e(unitText),tone)}${ctx.metric('預估規模增減',e(amount),tone)}${ctx.metric('前一營業日淨值',Number.isFinite(Number(row.previousBusinessDayNAV))?n(Number(row.previousBusinessDayNAV)):'資料不足')}${ctx.metric('官方資料時間',e(`${row.sourceDate??'日期不足'} ${row.sourceTime??''}`))}</div>`);
 }
 const validMonth=value=>typeof value==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(value)&&Number.isInteger(Number(value.slice(0,4)))&&Number(value.slice(0,4))>=1900;
 function validMonthlyReport(d,period){
  if(!d||d.schemaVersion!==1||d.period!==period||!validMonth(d.period)||d.periodSemantics!=="as_of_last_business_day_of_month")return false;
  if(typeof d.reportDateROC!=="string")return false;
  const parts=d.reportDateROC.split("/");
  if(parts.length!==2||!/^\d{3}$/.test(parts[0])||!/^\d{2}$/.test(parts[1]))return false;
  if(Number(parts[0])+1911!==Number(period.slice(0,4))||Number(parts[1])!==Number(period.slice(5,7)))return false;
  if(d.unitLabel!=="仟單位"&&d.unitLabel!=="張數")return false;
  if(d.issuedUnitsField!=="發行單位數("+d.unitLabel+")"||d.tradedUnitsField!=="成交單位數("+d.unitLabel+")")return false;
  if(d.complete!==true||!d.coverage||!Number.isSafeInteger(d.coverage.reportedRows)||!Number.isSafeInteger(d.coverage.availableRows))return false;
  if(d.coverage.reportedRows<0||d.coverage.availableRows!==d.coverage.reportedRows||!Array.isArray(d.funds)||d.funds.length!==d.coverage.reportedRows)return false;
  if(!validTimestamp(d.generatedAt)||!d.source||typeof d.source.sha256!=="string"||!/^[0-9a-f]{64}$/.test(d.source.sha256))return false;
  try{const source=new URL(d.source.pageURL);if(source.protocol!=="https:"||source.hostname!=="www.tpex.org.tw")return false;}catch{return false;}
  const symbols=d.funds.map(x=>x&&x.symbol);
  if(symbols.some(x=>typeof x!=="string"||!/^[A-Z0-9]{4,6}$/.test(x)||x!==x.trim())||new Set(symbols).size!==symbols.length)return false;
  for(const fund of d.funds){
   if(typeof fund.name!=="string"||!fund.name.trim())return false;
   for(const key of ["issuedUnitsRaw","fundSizeRaw","closePriceRaw","navRaw","premiumDiscountPercentRaw"])if(typeof fund[key]!=="string")return false;
   for(const key of ["issuedUnits","fundSize","closePrice","nav","premiumDiscountPercent"])if(fund[key]!=null&&!Number.isFinite(fund[key]))return false;
  }
  return true;
 }

 function modeTabs(){const tabs=[['daily','每日單位變化'],['monthly','月底規模與發行單位']].map(([value,label])=>'<button type="button" data-etf-flow-mode="'+value+'" aria-pressed="'+(mode===value)+'" class="'+(mode===value?'primary':'')+'">'+label+'</button>').join('');return '<div class="toolbar" role="group" aria-label="ETF 資料頻率">'+tabs+'</div>';}
 async function dailyPage(){
  const index=await publicData('rebuild/etf-unit-flows/index.json');
  if(index.schemaVersion!==1||!Array.isArray(index.dates))throw Error('ETF單位歷史日期索引格式不符');
  const dates=[...new Set(index.dates.filter(day=>validDay(day)&&day<=taipeiDay()))].sort();
  if(!dates.length)throw Error('ETF單位歷史資料尚未發布');
  if(!selectedDate||!dates.includes(selectedDate))selectedDate=dates.at(-1);
  const d=await publicData('rebuild/etf-unit-flows/'+encodeURIComponent(selectedDate)+'.json');
  if(d.schemaVersion!==1||d.unit!=='beneficiary_units_and_estimated_twd'||d.valuationBasis!=='issued_unit_delta_times_previous_business_day_nav'||d.cashFlowAvailable!==false||d.date!==selectedDate||!validDay(d.cutoff)||d.cutoff<d.date||d.cutoff>taipeiDay()||!validSnapshot(d))throw Error('ETF發行單位來源日期、覆蓋率或估算契約不符合，暫停顯示');
  const eligible=s=>resolveListingStatus(s,taipeiDay(),state.listing).eligible;
  const all=(d.funds??[]).filter(x=>x.status==='AVAILABLE'&&eligible(x.symbol)&&Number.isSafeInteger(x.issuedUnitChange)&&Number.isFinite(x.estimatedNetAssetChangeTWD));
  const rows=all.filter(x=>direction==='all'||(direction==='increase'?x.issuedUnitChange>0:x.issuedUnitChange<0)).sort((a,b)=>(direction==='decrease'?a.estimatedNetAssetChangeTWD-b.estimatedNetAssetChangeTWD:b.estimatedNetAssetChangeTWD-a.estimatedNetAssetChangeTWD)||compareCodepoints(a.symbol,b.symbol));
  const counts=`<div class="metric-grid">${ctx.metric('官方 ETF 身份數',n(d.coverage.expectedFunds,0))}${ctx.metric('同日有效資料',n(d.coverage.availableFunds,0))}${ctx.metric('資料不足',n(d.coverage.unavailableFunds,0))}</div>`;
  const controls=`<div class="toolbar" role="group" aria-label="ETF 單位變化方向">${[['all','全部'],['increase','發行單位增加'],['decrease','發行單位減少']].map(([v,label])=>`<button type="button" data-etf-unit-direction="${v}" aria-pressed="${direction===v}" class="${direction===v?'primary':''}">${label}</button>`).join('')}</div>`;
  const dateControl=`<label>資料日期<select data-etf-unit-date aria-label="選擇 ETF 單位變化日期">${dates.slice().reverse().map(day=>`<option value="${e(day)}" ${day===selectedDate?'selected':''}>${e(day)}</option>`).join('')}</select></label>`;
  const note=`<p class="muted">所選資料日期：${e(d.date)}；擷取時間：${e(d.generatedAt)}。歷史清單只顯示已保存官方快照的日期。</p><p>預估規模增減＝當日已發行受益單位差 × 前一營業日每單位淨值。ETF 申購／買回可能採實物方式，這是規模變化估計，不是實際現金流或二級市場成交金額；缺少有效同日資料時不補零。</p><a class="directory-link" href="https://mis.twse.com.tw/stock/etf_nav.jsp?ex=tse" target="_blank" rel="noopener noreferrer">開啟 TWSE 官方 ETF 單位資料 ↗</a>`;
  return card('ETF 申購／買回單位變化',dateControl+counts+note)+card('變化方向',controls)+ (rows.length?rows.map(present).join(''):status('尚無符合條件的基金','官方來源沒有此方向的同日有效資料，或目前上市資格尚未確認。'));
 }
 async function monthlyPage(){
  const index=await publicData('rebuild/etf-unit-monthly/index.json');
  if(index.schemaVersion!==1||!Array.isArray(index.periods))throw Error('ETF 月底資料索引格式不符');
  const periods=[...new Set(index.periods.filter(p=>validMonth(p)&&p<=taipeiDay().slice(0,7)))].sort();
  if(!periods.length)throw Error('Public_Data 尚未發布 ETF 月底報表月份');
  if(!selectedMonth||!periods.includes(selectedMonth))selectedMonth=periods.at(-1);
  const d=await publicData(`rebuild/etf-unit-monthly/${encodeURIComponent(selectedMonth)}.json`);
  if(!validMonthlyReport(d,selectedMonth))throw Error('ETF 月底報表日期、原始單位、來源或完整性契約不符，暫停顯示');
  const options=periods.slice().reverse().map(period=>`<option value="${e(period)}" ${period===selectedMonth?'selected':''}>${e(period)}</option>`).join('');
  const picker=`<label>資料月份<select data-etf-unit-month aria-label="選擇 ETF 月底資料月份">${options}</select></label>`;
  const note=`<p class="muted">官方報表月份：${e(d.reportDateROC)}；來源擷取時間：${e(d.generatedAt)}；基金列 ${n(d.coverage.availableRows,0)}/${n(d.coverage.reportedRows,0)}。</p><p>資料截至該月最後營業日。保留來源原始單位標籤，不跨標籤換算；不推算每日申贖或現金流。</p><a class="directory-link" href="${e(d.source.pageURL)}" target="_blank" rel="noopener noreferrer">開啟 TPEx 官方月報 ↗</a>`;
  const rows=d.funds.slice().sort((a,b)=>(b.fundSize??-1)-(a.fundSize??-1)||compareCodepoints(a.symbol,b.symbol)).map(fund=>{
   const name=fund.name.trim()||fund.symbol;
   return card('',`<a class="directory-link" href="#/etf?symbol=${encodeURIComponent(fund.symbol)}" aria-label="${e(name)} ${e(fund.symbol)}，查看基金資訊"><span class="identity"><strong>${e(name)}</strong><span>${e(fund.symbol)}</span></span><span aria-hidden="true">›</span></a>${favoriteButton(fund.symbol,name,'etf-monthly-'+fund.symbol)}<div class="metric-grid">${ctx.metric(`發行單位（${e(d.unitLabel)}）`,e(fund.issuedUnits==null?fund.issuedUnitsRaw:n(fund.issuedUnits,0)))}${ctx.metric('基金規模（官方元值）',e(fund.fundSize==null?fund.fundSizeRaw:n(fund.fundSize,0)))}${ctx.metric('收盤價',e(fund.closePrice==null?fund.closePriceRaw:n(fund.closePrice)))}${ctx.metric('單位淨值',e(fund.nav==null?fund.navRaw:n(fund.nav)))}${ctx.metric('折溢價',fund.premiumDiscountPercent==null?e(fund.premiumDiscountPercentRaw):`${n(fund.premiumDiscountPercent)}%`)}</div>`);
  }).join('');
  return card('ETF 月底規模與發行單位',picker+note)+ (rows||status('官方月報沒有基金資料','所選月份目前沒有可用的 TPEx ETF 報表列。'));
 }
 async function page(){
  let body;
  try{body=mode==='monthly'?await monthlyPage():await dailyPage();}
  catch(error){body=status(mode==='monthly'?'ETF 月底資料暫不可用':'ETF 每日單位資料暫不可用',error?.message||'Public_Data 資料尚未發布。');}
  return modeTabs()+body;
 }
 function listen(app){app.addEventListener('change',async ev=>{if(ev.target.matches('[data-etf-unit-date]')){selectedDate=ev.target.value;await ctx.refresh();}if(ev.target.matches('[data-etf-unit-month]')){selectedMonth=ev.target.value;await ctx.refresh();}});app.addEventListener('click',async ev=>{const modeButton=ev.target.closest('[data-etf-flow-mode]');if(modeButton){mode=modeButton.dataset.etfFlowMode==='monthly'?'monthly':'daily';await ctx.refresh();return;}const button=ev.target.closest('[data-etf-unit-direction]');if(!button)return;direction=button.dataset.etfUnitDirection;await ctx.refresh();});}
 return {page,listen,validMonthlyReport};
}

export function fundSnapshotDate(fund){
 for(const value of [fund?.as_of,fund?.date]){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||value>taipeiDay())continue;
  const parsed=new Date(value+'T00:00:00Z');
  if(Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===value)return value;
 }
 return null;
}

export function fundDisclosure(fund){
 const raw=fund.holdings_as_of,parsed=typeof raw==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(raw)?new Date(raw+'T00:00:00Z'):null;
 const date=parsed&&Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===raw&&raw<=taipeiDay()?raw:null;
 const source=typeof fund.holdings_source==='string'&&fund.holdings_source.trim()?fund.holdings_source.trim():null;
 const complete=fund.data_mode==='full_holdings'&&fund.holdings_verified_complete===true&&!!date&&!!source;
 const originLabels={LIVE_UNVERIFIED_SOURCE:'即時來源頁・完整性未驗證',REUSED_PRIOR_SNAPSHOT:'沿用前次快照・非本次更新',UNAVAILABLE:'未取得持倉來源'};
 const origin=originLabels[fund.holdings_origin]??'來源狀態未提供';
 const retrievedAt=typeof fund.holdings_retrieved_at==='string'&&fund.holdings_retrieved_at.trim()?fund.holdings_retrieved_at.trim():null;
  const reusedAt=typeof fund.holdings_reused_at==='string'&&fund.holdings_reused_at.trim()?fund.holdings_reused_at.trim():null;
  return {date,source,complete,origin,retrievedAt,reusedAt};
}


export function validQuarterlyETFReport(report, entry, symbol, today=taipeiDay()){
 if(!report||report.schemaVersion!==1||report.period!==entry?.period||report.reportUniverseCoverage!=="UNVERIFIED"||report.scope!=="quarterly Taiwan equity disclosure only; not a full multi-asset portfolio")return false;
 if(!/^20\d{2}Q[1-4]$/.test(report.period)||!/^https:\/\/mopsov\.twse\.com\.tw\/mops\/web\/[a-z0-9_]+$/.test(report.source??"")||!/^[0-9a-f]{64}$/.test(report.sourceSHA256??"")||!/^[0-9a-f]{64}$/.test(report.parserSHA256??""))return false;
 const year=Number(report.period.slice(0,4)),quarter=Number(report.period.slice(-1)),todayYear=Number(today.slice(0,4)),todayQuarter=Math.ceil(Number(today.slice(5,7))/3);
 if(year>todayYear||(year===todayYear&&quarter>todayQuarter))return false;
 if(entry.path!==`data/rebuild/etf-quarterly-holdings/${entry.period}-${entry.route}.json`||!/^[a-z0-9_]+$/.test(entry.route)||entry.symbols&&!entry.symbols.includes(symbol))return false;
 const fund=report.funds?.[symbol];if(!fund||fund.symbol!==symbol||fund.period!==entry.period||!fund.fundName?.trim()||fund.holdingsScope!=="TWSE_TPEX_REPORTED_EQUITY_SECURITIES_ONLY"||fund.completeForReportedTaiwanEquityScope!==true||fund.completeForFullFundPortfolio!==false||!Number.isFinite(fund.reportedTotalWeightPercent)||!Array.isArray(fund.holdings)||fund.holdings.length===0)return false;
 const ids=fund.holdings.map(row=>row.stock_id),sum=fund.holdings.reduce((total,row)=>total+row.weight,0);
 return new Set(ids).size===ids.length&&fund.holdings.every(row=>/^[0-9A-Z]{4,6}$/.test(row.stock_id??"")&&row.stock_name?.trim()&&Number.isFinite(row.weight)&&row.weight>=0&&row.weight<=100)&&Math.abs(sum-fund.reportedTotalWeightPercent)<=Math.max(.006,.005*(fund.holdings.length+1)+1e-9);
}

export async function quarterlyETFDisclosure(ctx,symbol){
 const {state,card,status,rowList,publicData}=ctx;
 if(!resolveListingStatus(symbol,taipeiDay(),state.listing).eligible)return status("MOPS 官方季報暫不可用","上市資格尚未確認，請同步 Public_Data 後重試。");
 try{
  const index=await publicData("rebuild/etf-quarterly-holdings/index.json");
  if(index.schemaVersion!==1||!Array.isArray(index.reports))throw Error("官方季報索引格式不符");
  const today=taipeiDay(),year=Number(today.slice(0,4)),quarter=Math.ceil(Number(today.slice(5,7))/3);
  const reports=index.reports.filter(entry=>/^20\d{2}Q[1-4]$/.test(entry.period??"")&&/^[a-z0-9_]+$/.test(entry.route??"")&&(!entry.symbols||entry.symbols.includes(symbol))&&entry.path===`data/rebuild/etf-quarterly-holdings/${entry.period}-${entry.route}.json`&&(Number(entry.period.slice(0,4))<year||(Number(entry.period.slice(0,4))===year&&Number(entry.period.slice(-1))<=quarter))).sort((a,b)=>a.period===b.period?a.route.localeCompare(b.route):b.period.localeCompare(a.period));
  if(!reports.length)return status("尚無此 ETF 的官方季報","Public_Data 季報索引沒有可對應報表；這不代表基金沒有持股。");
  for(const entry of reports){
   if(entry.symbols&&!entry.symbols.includes(symbol))continue;
   const report=await publicData(entry.path.slice("data/".length));
   if(!validQuarterlyETFReport(report,entry,symbol,today))throw Error("季報來源、覆蓋範圍或資料完整性契約不符");
   const fund=report.funds[symbol],holdings=fund.holdings.filter(item=>resolveListingStatus(item.stock_id,today,state.listing).eligible).map(item=>({...state.rows.find(row=>row.symbol===item.stock_id),...identity(item.stock_id,{name:item.stock_name},state.listing?.stocks?.[item.stock_id]),weight:item.weight})).sort((a,b)=>b.weight-a.weight);
   return card("MOPS 官方季度持股明細",`<p><strong>${e(fund.fundName)} ${e(symbol)}</strong>・申報期間 ${e(fund.period)}</p><div class="metric-grid">${ctx.metric("申報台灣股票權重",`${n(fund.reportedTotalWeightPercent)}%`)}${ctx.metric("季報股票列",n(fund.holdings.length,0))}${ctx.metric("可連結目前上市證券",n(holdings.length,0))}</div><p class="muted">本表只呈現 MOPS 季報的台灣股票列；海外資產、債券、現金及衍生品等未由此報表證明完整。權重保留來源原值，不重新正規化。HTML SHA-256：${e(report.sourceSHA256)}</p><a class="directory-link" href="${e(report.source)}" target="_blank" rel="noopener noreferrer">開啟官方 MOPS 報表頁面 ↗</a>`)+(holdings.length?rowList(holdings,`quarterly-constituents.${symbol}`):status("本季沒有可連結的目前上市股票","原始申報列保留；未確認上市資格的標的不列行情。"));
  }
  return status("尚無此 ETF 的官方季報","已保存的官方季報沒有此 ETF 的精確資料；不代表基金沒有持股。");
 }catch(error){return status("MOPS 官方季報暫不可用",`${error?.message??"Public_Data 資料尚未發布。"}；不以其他頻率或第三方快照代替季報。`);}
}

export async function fundInformation(ctx,symbol,row){
 const allowed=()=>resolveListingStatus(symbol,taipeiDay(),ctx.state.listing).eligible;
 if(!allowed())return ctx.status('上市資格尚未確認','請同步資料後重新載入。');
 const payload=await ctx.publicData('rebuild/etf-facts.json');
 if(payload.schemaVersion!==1||payload.cutoff!==taipeiDay()||payload.dateSemantics!=='asOf_is_source_fact_date_generatedAt_is_collection_time'||!allowed())throw Error('基金基本資料資格或格式已過期，請同步資料');
 const fund=payload.funds?.[symbol];if(!fund)return ctx.status('尚無基金基本資料','官方來源未提供此基金的可用紀錄。');
 if(fund.symbol!==symbol)throw Error('基金基本資料身份不符');
 const fields={'基金全名':fund.fullName??fund.name,'發行商':fund.issuer,'追蹤指數':fund.indexName,'資產類型':fund.fundType,'成立日期':fund.inceptionDate,'上市／上櫃日期':fund.listingDate,'管理費／保管費':'此官方來源未提供費率','來源資料日':fund.asOf};
 let link='';try{const url=new URL(fund.sourceURL);if(url.protocol==='https:')link=`<a class="directory-link" href="${e(url.href)}" target="_blank" rel="noopener noreferrer">開啟官方基本資料來源 ↗</a>`;}catch{}
 return ctx.card(`${row.name||fund.name} ${symbol}・基金資訊`,`<div class="metric-grid">${Object.entries(fields).map(([key,value])=>ctx.metric(key,e(value??'來源未提供'))).join('')}</div><p class="source">擷取時間：${e(payload.generatedAt)}</p><p>擷取時間不是基金成分揭露日。未提供單位與日期的資產規模、淨值及費率不推算。</p>${link}`);
}
