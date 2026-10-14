import {escapeHTML as e,number as n,resolveListingStatus,taipeiDay,compareCodepoints,identity} from './core.mjs';
export function createETFUnitFlows(ctx){
 const {state,card,status,publicData}=ctx;let direction='all',selectedDate='',mode='daily',selectedMonth='';
 const validDay=day=>typeof day==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(day)&&Number.isFinite(Date.parse(day+'T00:00:00Z'))&&new Date(day+'T00:00:00Z').toISOString().slice(0,10)===day;
 const validMonth=month=>typeof month==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(month)&&month<=taipeiDay().slice(0,7);
 const validTimestamp=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/.test(value)&&validDay(value.slice(0,10))&&Number.isFinite(Date.parse(value));
 const modeControl=()=>card('資料頻率',`<div class="toolbar" role="group" aria-label="ETF資料頻率">${[['daily','每日單位變化'],['monthly','月底規模與發行單位']].map(([v,label])=>`<button type="button" data-etf-unit-mode="${v}" aria-pressed="${mode===v}" class="${mode===v?'primary':''}">${label}</button>`).join('')}</div>`);
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
  return card('',`<a class="directory-link" href="#/etf?symbol=${encodeURIComponent(security.symbol)}" aria-label="${e(displayName)} ${e(security.symbol)}，查看基金資訊"><span class="identity"><strong>${e(displayName)}</strong><span>${e(security.symbol||'資料不足')}</span></span><span aria-hidden="true">›</span></a><div class="metric-grid">${ctx.metric('受益單位增減',e(unitText),tone)}${ctx.metric('預估規模增減',e(amount),tone)}${ctx.metric('前一營業日淨值',Number.isFinite(Number(row.previousBusinessDayNAV))?n(Number(row.previousBusinessDayNAV)):'資料不足')}${ctx.metric('官方資料時間',e(`${row.sourceDate??'日期不足'} ${row.sourceTime??''}`))}</div>`);
 }
 function validMonthlySnapshot(snapshot){
  const c=snapshot.coverage,rows=snapshot.funds,seen=new Set();
  if(snapshot.schemaVersion!==1||!validMonth(snapshot.period)||snapshot.periodSemantics!=='as_of_last_business_day_of_month'||!/^\d{2,3}\/(0[1-9]|1[0-2])$/.test(snapshot.reportDateROC)||!['仟單位','張數'].includes(snapshot.unitLabel)||snapshot.issuedUnitsField!==`發行單位數(${snapshot.unitLabel})`||snapshot.tradedUnitsField!==`成交單位數(${snapshot.unitLabel})`||!c||!Array.isArray(rows)||!Number.isSafeInteger(c.reportedRows)||!Number.isSafeInteger(c.availableRows)||c.reportedRows<0||c.availableRows!==c.reportedRows||rows.length!==c.reportedRows||snapshot.complete!==true||!validTimestamp(snapshot.generatedAt)||!snapshot.source||!/^[0-9a-f]{64}$/.test(snapshot.source.sha256))return false;
  const [rocYear,rocMonth]=snapshot.reportDateROC.split('/').map(Number);
  if(`${rocYear+1911}-${String(rocMonth).padStart(2,'0')}`!==snapshot.period)return false;
  return rows.every(row=>{
   const symbol=row?.symbol,name=row?.name;
   if(typeof symbol!=='string'||!/^[A-Z0-9]{4,6}$/.test(symbol)||typeof name!=='string'||!name.trim()||seen.has(symbol))return false;
   seen.add(symbol);
   return ['turnoverTWDThousandsRaw','tradedUnitsRaw','closePriceRaw','navRaw','premiumDiscountPercentRaw','issuedUnitsRaw','fundSizeRaw'].every(key=>typeof row[key]==='string')&&['turnoverTWDThousands','tradedUnits','closePrice','nav','premiumDiscountPercent','issuedUnits','fundSize'].every(key=>row[key]===null||Number.isFinite(row[key]));
  });
 }
 function presentMonth(row,d){
  const security=identity(row.symbol,row,state.listing?.stocks?.[row.symbol]),name=security.name;
  const facts=`<div class="metric-grid">${ctx.metric(`發行單位 (${e(d.unitLabel)})`,row.issuedUnits===null?e(row.issuedUnitsRaw||'資料不足'):n(row.issuedUnits,0))}${ctx.metric('基金規模 (官方原值)',row.fundSize===null?e(row.fundSizeRaw||'資料不足'):n(row.fundSize,0))}${ctx.metric('收盤價',row.closePrice===null?e(row.closePriceRaw||'資料不足'):n(row.closePrice))}${ctx.metric('單位淨值',row.nav===null?e(row.navRaw||'資料不足'):n(row.nav))}${ctx.metric('折溢價',row.premiumDiscountPercent===null?e(row.premiumDiscountPercentRaw||'資料不足'):`${n(row.premiumDiscountPercent)}%`)}</div>`;
  const identityMarkup=`<span class="identity"><strong>${e(name)}</strong><span>${e(security.symbol)}</span></span>`;
  const link=resolveListingStatus(security.symbol,taipeiDay(),state.listing).eligible?`<a class="directory-link" href="#/etf?symbol=${encodeURIComponent(security.symbol)}" aria-label="${e(name)} ${e(security.symbol)}，查看基金資訊">${identityMarkup}<span aria-hidden="true">›</span></a>`:`<div class="directory-link">${identityMarkup}<span class="muted">歷史報表</span></div>`;
  return card('',`${link}${facts}`);
 }
 async function monthlyPage(){
  const index=await publicData('rebuild/etf-unit-monthly/index.json');
  if(index.schemaVersion!==1||!Array.isArray(index.periods))throw Error('TPEx ETF月底資料索引格式不符');
  const periods=[...new Set(index.periods.filter(validMonth))].sort();
  if(!periods.length)throw Error('TPEx ETF月底資料尚未發布');
  if(!selectedMonth||!periods.includes(selectedMonth))selectedMonth=periods.at(-1);
  const d=await publicData(`rebuild/etf-unit-monthly/${encodeURIComponent(selectedMonth)}.json`);
  if(!validMonthlySnapshot(d)||d.period!==selectedMonth)throw Error('TPEx ETF月底資料、單位標籤或來源完整性不符，暫停顯示');
  const selector=`<label>資料月份<select data-etf-unit-month aria-label="選擇 TPEx ETF 月底資料月份">${periods.slice().reverse().map(month=>`<option value="${e(month)}" ${month===selectedMonth?'selected':''}>${e(month)}</option>`).join('')}</select></label>`;
  const summary=`<div class="metric-grid">${ctx.metric('報表 ETF 檔數',n(d.coverage.reportedRows,0))}${ctx.metric('原始發行單位標籤',e(d.unitLabel))}${ctx.metric('官方報表月份',e(d.reportDateROC))}</div>`;
  let sourceLink='';try{const url=new URL(d.source.pageURL);if(url.protocol==='https:'&&url.hostname==='www.tpex.org.tw')sourceLink=`<a class="directory-link" href="${e(url.href)}" target="_blank" rel="noopener noreferrer">開啟 TPEx 官方月報 ↗</a>`;}catch{}
  const note=`<p class="muted">TPEx 月報截至當月最後營業日。官方原始單位與基金規模逐月呈現；不跨「仟單位／張數」換算，也不推算單位增減、每日資金流或現金流。擷取時間：${e(d.generatedAt)}。</p>${sourceLink}`;
  const rows=d.funds.slice().sort((a,b)=>(Number(b.fundSize)||-1)-(Number(a.fundSize)||-1)||compareCodepoints(a.symbol,b.symbol));
  return modeControl()+card('ETF 月底規模與發行單位',selector+summary+note)+(rows.length?rows.map(row=>presentMonth(row,d)).join(''):status('官方月報沒有基金資料','所選月份目前沒有可用的 TPEx ETF 報表列。'));
 }
 async function page(){
  if(mode==='monthly')return monthlyPage();
  const index=await publicData('rebuild/etf-unit-flows/index.json');
  if(index.schemaVersion!==1||!Array.isArray(index.dates))throw Error('ETF單位歷史日期索引格式不符');
  const dates=[...new Set(index.dates.filter(day=>validDay(day)&&day<=taipeiDay()))].sort();
  if(!dates.length)throw Error('ETF單位歷史資料尚未發布');
  if(!selectedDate||!dates.includes(selectedDate))selectedDate=dates.at(-1);
  const d=await publicData(`rebuild/etf-unit-flows/${encodeURIComponent(selectedDate)}.json`);
  if(d.schemaVersion!==1||d.unit!=='beneficiary_units_and_estimated_twd'||d.valuationBasis!=='issued_unit_delta_times_previous_business_day_nav'||d.cashFlowAvailable!==false||d.date!==selectedDate||!validDay(d.cutoff)||d.cutoff<d.date||d.cutoff>taipeiDay()||!validSnapshot(d))throw Error('ETF發行單位來源日期、覆蓋率或估算契約不符合，暫停顯示');
  const eligible=s=>resolveListingStatus(s,taipeiDay(),state.listing).eligible;
  const all=(d.funds??[]).filter(x=>x.status==='AVAILABLE'&&eligible(x.symbol)&&Number.isSafeInteger(x.issuedUnitChange)&&Number.isFinite(x.estimatedNetAssetChangeTWD));
  const rows=all.filter(x=>direction==='all'||(direction==='increase'?x.issuedUnitChange>0:x.issuedUnitChange<0)).sort((a,b)=>(direction==='decrease'?a.estimatedNetAssetChangeTWD-b.estimatedNetAssetChangeTWD:b.estimatedNetAssetChangeTWD-a.estimatedNetAssetChangeTWD)||compareCodepoints(a.symbol,b.symbol));
  const counts=`<div class="metric-grid">${ctx.metric('官方 ETF 身份數',n(d.coverage.expectedFunds,0))}${ctx.metric('同日有效資料',n(d.coverage.availableFunds,0))}${ctx.metric('資料不足',n(d.coverage.unavailableFunds,0))}</div>`;
  const controls=`<div class="toolbar" role="group" aria-label="ETF 單位變化方向">${[['all','全部'],['increase','發行單位增加'],['decrease','發行單位減少']].map(([v,label])=>`<button type="button" data-etf-unit-direction="${v}" aria-pressed="${direction===v}" class="${direction===v?'primary':''}">${label}</button>`).join('')}</div>`;
  const dateControl=`<label>資料日期<select data-etf-unit-date aria-label="選擇 ETF 單位變化日期">${dates.slice().reverse().map(day=>`<option value="${e(day)}" ${day===selectedDate?'selected':''}>${e(day)}</option>`).join('')}</select></label>`;
  const note=`<p class="muted">所選資料日期：${e(d.date)}；擷取時間：${e(d.generatedAt)}。歷史清單只顯示已保存官方快照的日期。</p><p>預估規模增減＝當日已發行受益單位差 × 前一營業日每單位淨值。ETF 申購／買回可能採實物方式，這是規模變化估計，不是實際現金流或二級市場成交金額；缺少有效同日資料時不補零。</p><a class="directory-link" href="https://mis.twse.com.tw/stock/etf_nav.jsp?ex=tse" target="_blank" rel="noopener noreferrer">開啟 TWSE 官方 ETF 單位資料 ↗</a>`;
  return modeControl()+card('ETF 申購／買回單位變化',dateControl+counts+note)+card('變化方向',controls)+ (rows.length?rows.map(present).join(''):status('尚無符合條件的基金','官方來源沒有此方向的同日有效資料，或目前上市資格尚未確認。'));
 }
 function listen(app){app.addEventListener('change',async ev=>{if(ev.target.matches('[data-etf-unit-date]')){selectedDate=ev.target.value;await ctx.refresh();}if(ev.target.matches('[data-etf-unit-month]')){selectedMonth=ev.target.value;await ctx.refresh();}});app.addEventListener('click',async ev=>{const modeButton=ev.target.closest('[data-etf-unit-mode]');if(modeButton){mode=modeButton.dataset.etfUnitMode;await ctx.refresh();return;}const button=ev.target.closest('[data-etf-unit-direction]');if(!button)return;direction=button.dataset.etfUnitDirection;await ctx.refresh();});}
 return {page,listen};
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

function quarterlyPeriod(value){
 if(typeof value!=='string'||!/^20\d{2}Q[1-4]$/.test(value))return false;
 const [year,quarter]=[Number(value.slice(0,4)),Number(value.slice(-1))],today=taipeiDay();
 const currentYear=Number(today.slice(0,4)),currentQuarter=Math.floor((Number(today.slice(5,7))-1)/3)+1;
 return year<currentYear||(year===currentYear&&quarter<=currentQuarter);
}

async function latestQuarterlyFund(publicData,symbol){
 const index=await publicData('rebuild/etf-quarterly-holdings/index.json');
 if(index?.schemaVersion!==1||!Array.isArray(index.reports))throw Error('MOPS ETF 季報索引格式不符');
 const reports=index.reports.filter(item=>quarterlyPeriod(item?.period)&&/^[a-z0-9_]+$/.test(item?.route??'')&&item.path===`data/rebuild/etf-quarterly-holdings/${item.period}-${item.route}.json`&&(item.symbols==null||Array.isArray(item.symbols)&&item.symbols.includes(symbol))).sort((a,b)=>b.period.localeCompare(a.period)||a.route.localeCompare(b.route));
 for(const item of reports){
  const payload=await publicData(item.path.slice('data/'.length));
  if(payload?.schemaVersion!==1||payload.period!==item.period||payload.reportUniverseCoverage!=='UNVERIFIED'||payload.scope!=='quarterly Taiwan equity disclosure only; not a full multi-asset portfolio'||!/^https:\/\/mopsov\.twse\.com\.tw\/mops\/web\/[a-z0-9_]+$/.test(payload.source??'')||!/^[0-9a-f]{64}$/.test(payload.sourceSHA256??'')||!/^[0-9a-f]{64}$/.test(payload.parserSHA256??'')||!payload.funds||typeof payload.funds!=='object')throw Error(`MOPS ETF 季報 ${item.period} 契約不符`);
  if(payload.source!==`https://mopsov.twse.com.tw/mops/web/${item.route}`)throw Error(`MOPS ETF 季報 ${item.period} 路由來源不符`);
  const fund=payload.funds[symbol];
  if(!fund)continue;
  if(fund.symbol!==symbol||fund.period!==item.period||fund.holdingsScope!=='TWSE_TPEX_REPORTED_EQUITY_SECURITIES_ONLY'||fund.completeForReportedTaiwanEquityScope!==true||fund.completeForFullFundPortfolio!==false||!Array.isArray(fund.holdings)||!Number.isFinite(fund.reportedTotalWeightPercent))throw Error(`MOPS ETF 季報 ${item.period} 基金身份或涵蓋範圍不符`);
  const seen=new Set();
  for(const holding of fund.holdings){
   if(typeof holding.stock_id!=='string'||!/^[0-9A-Z]{4,6}$/.test(holding.stock_id)||typeof holding.stock_name!=='string'||!holding.stock_name.trim()||!Number.isFinite(holding.weight)||holding.weight<0||holding.weight>100||seen.has(holding.stock_id))throw Error(`MOPS ETF 季報 ${item.period} 含無效或重複持股列`);
   seen.add(holding.stock_id);
  }
  const total=fund.holdings.reduce((sum,holding)=>sum+holding.weight,0);
  const roundingTolerance=Math.max(0.006,0.005*(fund.holdings.length+1)+1e-9);
  if(!fund.holdings.length||Math.abs(total-fund.reportedTotalWeightPercent)>roundingTolerance)throw Error(`MOPS ETF 季報 ${item.period} 權重與官方合計不符`);
  return {period:item.period,source:payload.source,sourceSHA256:payload.sourceSHA256,payload,fund};
 }
 return null;
}

export async function quarterlyFundHoldingsPanel(ctx,symbol,row){
 const {state,publicData,publicBytes,status,card,rowList}=ctx;
 if(!resolveListingStatus(symbol,taipeiDay(),state.listing).eligible)return status('ETF 上市資格尚未確認','停止載入基金的官方季報成分。');
 let disclosure;
 try{disclosure=await latestQuarterlyFund(publicData,symbol);}
 catch(error){return status('官方 ETF 季報暫不可用',error.message,'↗',true);}
 if(!disclosure)return status('尚無此 ETF 的官方季報','沒有已保存且可對應本基金的 MOPS 季報；這不表示基金沒有持股。');
 const {period,fund,payload}=disclosure;
 try{await verifyQuarterlyProvenance(publicBytes,period,payload,fund,symbol);}
 catch(error){return status('官方 ETF 季報來源驗證失敗',error.message);}
 const eligible=s=>resolveListingStatus(s,taipeiDay(),state.listing).eligible;
 const rows=fund.holdings.filter(item=>eligible(item.stock_id)).map(item=>({...state.rows.find(candidate=>candidate.symbol===item.stock_id),...identity(item.stock_id,{name:item.stock_name},state.listing?.stocks?.[item.stock_id]),weight:item.weight}));
 const source=`<a class="directory-link" href="${e(disclosure.source)}" target="_blank" rel="noopener noreferrer">開啟 MOPS 官方來源 ↗</a>`;
 const summary=`<p>${e(row.name||fund.fundName||symbol)} ${e(symbol)}・民國季別 ${e(period)}</p><p>台灣股票揭露權重 ${n(fund.reportedTotalWeightPercent)}%・來源列 ${fund.holdings.length} 筆・可連結目前上市證券 ${rows.length} 筆。</p><p class="muted">MOPS 季報僅呈現其申報的台灣股票列，不代表海外資產、債券、現金、衍生品或整檔基金部位已完整。權重保留原值，不重新正規化。原始 HTML SHA-256：${e(disclosure.sourceSHA256)}。</p>${source}`;
 return card('MOPS 官方季度持股明細',summary)+(rows.length?rowList(rows,`quarterly-constituents.${symbol}`):status('季報未含可連結的目前上市股票','來源持股保留於官方資料；未通過上市資格的項目不會當成目前行情列。'));
}

async function verifyQuarterlyProvenance(publicBytes,period,payload,fund,symbol){
 if(typeof publicBytes!=='function')throw Error('目前入口未提供原始來源驗證器');
 const hash=async bytes=>{
  if(!globalThis.crypto?.subtle)throw Error('此瀏覽器不支援 SHA-256 驗證');
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,'0')).join('');
 };
 const archivePrefix=`data/rebuild/etf-quarterly-holdings/raw/${period}/`;
 const rawPath=payload.rawArchive;
 if(typeof rawPath!=='string'||!rawPath.startsWith(archivePrefix)||rawPath!==`${archivePrefix}${payload.sourceSHA256}.html`)throw Error('MOPS 原始檔路徑或檔名與來源雜湊不符');
 if(await hash(await publicBytes(rawPath.slice('data/'.length)))!==payload.sourceSHA256)throw Error('MOPS 原始 HTML SHA-256 不符');
 if(payload.securityIdentityManifest==null&&payload.fundIdentityCrosswalk==null)return;
 const identityPath=`data/rebuild/etf-quarterly-holdings/raw/${period}/security-identities/manifest.json`;
 if(payload.securityIdentityManifest!==identityPath||!/^[0-9a-f]{64}$/.test(payload.securityIdentityManifestSHA256??''))throw Error('季度末證券身份 manifest 路徑或雜湊不符');
 const identityBytes=await publicBytes(identityPath.slice('data/'.length));
 if(await hash(identityBytes)!==payload.securityIdentityManifestSHA256)throw Error('季度末證券身份 manifest SHA-256 不符');
 let identityManifest;
 try{identityManifest=JSON.parse(new TextDecoder().decode(identityBytes));}catch{throw Error('季度末證券身份 manifest 格式錯誤');}
 const cutoff=new Date(Date.UTC(Number(period.slice(0,4)),Number(period.slice(-1))*3,0)).toISOString().slice(0,10);
 const sources=identityManifest?.sources;
 if(identityManifest?.schemaVersion!==1||!Array.isArray(sources)||sources.length!==2)throw Error('季度末官方交易所身份來源不足或 manifest 契約不符');
 for(const source of sources){
  const path=source?.path;
  if(typeof path!=='string'||!new RegExp(`^raw/${period}/security-identities/(?:twse|tpex)-${cutoff}\\.(?:json|csv)$`).test(path)||source.asOf!==cutoff||!/^https:\/\/(?:www\.twse\.com\.tw|www\.tpex\.org\.tw)\//.test(source.sourceURL??'')||!/^[0-9a-f]{64}$/.test(source.sha256??''))throw Error('季度末官方身份來源欄位或日期不合法');
  const bytes=await publicBytes(`rebuild/etf-quarterly-holdings/${path}`);
  if(await hash(bytes)!==source.sha256)throw Error('季度末官方交易所身份原始檔 SHA-256 不符');
 }
 const crosswalkPath=`data/rebuild/etf-quarterly-holdings/${period}/fund-symbol-crosswalk.json`;
 if(payload.fundIdentityCrosswalk!==crosswalkPath||!/^[0-9a-f]{64}$/.test(payload.fundIdentityCrosswalkSHA256??''))throw Error('基金代號交叉表路徑或雜湊不符');
 const crosswalkBytes=await publicBytes(crosswalkPath.slice('data/'.length));
 if(await hash(crosswalkBytes)!==payload.fundIdentityCrosswalkSHA256)throw Error('基金代號交叉表 SHA-256 不符');
 let crosswalk;
 try{crosswalk=JSON.parse(new TextDecoder().decode(crosswalkBytes));}catch{throw Error('基金代號交叉表格式錯誤');}
 const norm=value=>String(value??'').normalize('NFKC').replace(/[\s　]/g,'').replaceAll('臺','台').toLowerCase();
 const matches=(crosswalk.fundMappings??[]).filter(item=>item?.period===period&&item?.symbol===symbol&&item?.issuerCode===fund.issuerCode&&norm(item?.mopsFundName)===norm(fund.fundName)&&item?.sourceURL===fund.fundIdentitySource&&item?.listingDate<=cutoff);
 if(crosswalk?.schemaVersion!==1||crosswalk.period!==period||matches.length!==1)throw Error('基金法律名稱、代號或上市日期與官方交叉表不符');
 for(const holding of fund.holdings){
  if(!['TWSE','TPEX'].includes(holding.market)||typeof holding.stock_name!=='string'||typeof holding.stock_id!=='string')throw Error('上櫃季報持股缺少來源市場或股票身份');
 }
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
