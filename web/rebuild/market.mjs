import {indexIntradayBySymbol} from './index-intraday.mjs?v=9';
import {escapeHTML as e,number as n,taipeiDay,exchangeDateLabel,exchangeClockMarkup} from './core.mjs';
import {marketTabs} from './market-tabs.mjs';

const marginCategories=[['margin_pressure_highest','融資壓力最高','壓力分數'],['estimated_loss_deepest','預估融資損失最深','預估報酬原值'],['closest_to_warning','最接近警戒','距 130% 警戒原值'],['margin_usage_highest','融資使用率最高','使用率原值'],['margin_increase_5d','5 日融資增加','餘額變動原值'],['margin_increase_20d','20 日融資增加','餘額變動原值'],['price_down_margin_up','跌價融資增','壓力分數'],['price_up_margin_down','漲價融資減','壓力分數'],['margin_market_value_largest','融資市值最大','融資市值原值']];
const riskPanels=[['margin-risk','資券風險'],['divergence','大盤乖離'],['maintenance-history','維持率歷史'],['daily-margin','每日資券']];
const riskRow=payload=>Array.isArray(payload?.stocks)?payload.stocks[0]:Array.isArray(payload?.data)?payload.data[0]:payload?.data??payload;

async function marketInformation(ctx,section='risk',category='margin_pressure_highest',riskPanel='margin-risk'){
 const load=async path=>{try{return await ctx.publicData(path);}catch{return null;}};
 if(section==='calendar'){
  const payload=await load('meta/calendar.json'),events=(payload?.data??[]).filter(row=>Array.isArray(row)&&row.length>=2&&/^\d{4}-\d{2}-\d{2}$/.test(row[0])&&row[0]>=taipeiDay()).sort((a,b)=>a[0].localeCompare(b[0])).slice(0,12);
  return ctx.card('台灣市場行事曆・Public_Data',events.length?`${events.map(row=>`<article class="calendar-event"><strong>${e(row[0])}</strong><span>${e(row[1])}</span>${row[2]?`<small>${e(row[2])}</small>`:''}</article>`).join('')}<p class="source muted">來源欄位日期 ${e(payload?.date??'未提供')}。資料集沒有未來項目時顯示空狀態。</p>`:'<p role="status">Public_Data 行事曆目前沒有今日以後的交易日／休市公告。</p>');
 }
 if(section==='ranking'){
  const payload=await load('quant/margin_stock_rankings.json'),active=marginCategories.some(([id])=>id===category)?category:marginCategories[0][0],rows=payload?.[active]??[],[,,metricLabel]=marginCategories.find(([id])=>id===active);
  const tabs=`<nav class="market-info-tabs" aria-label="融資排行類別">${marginCategories.map(([id,label])=>`<a href="#/overview?panel=context&section=ranking&category=${encodeURIComponent(id)}"${id===active?' aria-current="page"':''}>${label}</a>`).join('')}</nav>`;
  const stocks=rows.slice(0,10).map(row=>{const symbol=String(row.stock_id??''),known=ctx.state.rows.find(item=>item.symbol===symbol),name=known?.name??ctx.state.listing?.stocks?.[symbol]?.name??(row.name&&row.name!==symbol?row.name:symbol),value=row.value??row.margin_pressure_score??row.estimated_margin_return??row.distance_to_warning_130??row.margin_usage_rate??row.margin_balance_change_5d??row.margin_balance_change_20d??row.margin_market_value;return `<article class="market-margin-stock"><a href="#/security?symbol=${encodeURIComponent(symbol)}">${e(name)} <small>${e(symbol)}</small></a><strong>${Number.isFinite(value)?n(value):'資料不足'}</strong>${ctx.favoriteButton?.(symbol,name,`market-margin-favorite-${symbol}`)??''}</article>`;}).join('');
  return tabs+ctx.card(`${marginCategories.find(([id])=>id===active)?.[1]??'個股融資排行'}・Public_Data`,payload?`${stocks||'<p role="status">此類別目前無排行資料。</p>'}<p class="source muted">資料日 ${e(payload.date??'資料不足')}・顯示 ${Math.min(rows.length,10)}／${rows.length} 檔；數值依來源原值（${e(metricLabel)}），可點股票名稱進入個股頁面。</p>`:'<p role="status">Public_Data quant/margin_stock_rankings.json 暫不可用。</p>');
 }
 if(riskPanel==='daily-margin'){
  const available=ctx.state.index?.available_days_tw_market_margin??[],cutoff=ctx.state.index?.latest_daily_tw??'9999-99-99',dates=available.filter(date=>/^\d{4}-\d{2}-\d{2}$/.test(date)&&date<=cutoff).slice(-30);
  const rows=[];
  for(const date of dates){
   const payload=await load(`daily/tw_market_margin/${date}.json`),row=Array.isArray(payload?.stocks)?payload.stocks[0]:payload;
   if(row?.date===date&&Number.isFinite(row.total_margin_balance)&&Number.isFinite(row.total_short_balance??0))rows.push(row);
  }
  if(rows.length<2)return ctx.card('大盤每日資券餘額・Public_Data','<p role="status">Public_Data daily/tw_market_margin 最近 30 個來源交易日不足 2 筆，暫不繪製趨勢。</p>');
  const values=rows.map(row=>row.total_margin_balance/1e8),low=Math.min(...values),high=Math.max(...values),span=high-low||1,points=values.map((value,index)=>`${index/(Math.max(values.length-1,1))*760},${10+(high-value)/span*140}`).join(' '),latest=rows.at(-1),previous=rows.at(-2),delta=Number.isFinite(latest.total_margin_change)?latest.total_margin_change:(latest.total_margin_balance-previous.total_margin_balance);
  return ctx.card('大盤每日資券餘額・Public_Data',`<svg class="chart" viewBox="0 0 760 170" role="img" aria-label="最近 ${rows.length} 個 Public_Data 交易日的融資餘額趨勢，億元"><polyline points="${points}" fill="none" stroke="var(--blue)" stroke-width="3"/></svg><div class="market-health-stats">${ctx.metric('最新資料日',e(latest.date))}${ctx.metric('融資餘額',`${n(latest.total_margin_balance/1e8,0)} 億元`)}${ctx.metric('融資日變化',`${n(delta/1e8,0)} 億元`)}</div><p class="source muted">取得 ${rows.length}/30 個可用交易日；以各筆 Public_Data 原始資料日為準，不視為即時資料。</p>`);
 }
 let card='';
 if(riskPanel==='margin-risk'){
  const risk=riskRow(await load('meta/market_risk.json'));
  card=risk?ctx.card('大盤資券風險・Public_Data',`<div class="market-health-stats">${ctx.metric('風險分數',risk.risk_score??'資料不足')}${ctx.metric('市場狀態',e(risk.status??'資料不足'))}${ctx.metric('散戶情緒',e(risk.retail_sentiment??'資料不足'))}</div><div class="market-health-stats">${ctx.metric('融資餘額',Number.isFinite(risk.margin_balance)?`${n(risk.margin_balance/1e8,0)} 億元`:'資料不足')}${ctx.metric('20 日均額',Number.isFinite(risk.margin_ma20)?`${n(risk.margin_ma20/1e8,0)} 億元`:'資料不足')}${ctx.metric('融資維持率',Number.isFinite(risk.maintenance_rate)?`${n(risk.maintenance_rate)}%`:'資料不足')}</div><p class="source muted">資料日 ${e(risk.date??'資料不足')}。風險值與狀態依來源原值呈現，不自行推估。</p>`):ctx.card('大盤資券風險・Public_Data','<p role="status">Public_Data meta/market_risk.json 暫不可用。</p>');
 }else if(riskPanel==='divergence'){
  const divergence=riskRow(await load('meta/market_divergence_alert.json'));
  card=divergence?ctx.card('大盤乖離警示・Public_Data',`<div class="market-health-stats">${ctx.metric('警示狀態',divergence.is_alert?e(divergence.severity??'警示'):'正常')}${ctx.metric('5 日乖離',Number.isFinite(divergence.bias5)?n(divergence.bias5):'資料不足')}${ctx.metric('波動倍率',Number.isFinite(divergence.vol_ratio)?`${n(divergence.vol_ratio)} 倍`:'資料不足')}</div>${Number.isFinite(divergence.crash_probability)?ctx.metric('Crash Probability',`${n(divergence.crash_probability*100)}%`):''}${divergence.summary?`<p>${e(divergence.summary)}</p>`:''}<p class="source muted">資料日 ${e(divergence.date??'資料不足')}。機率為來源模型估計。</p>`):ctx.card('大盤乖離警示・Public_Data','<p role="status">Public_Data meta/market_divergence_alert.json 暫不可用。</p>');
 }else if(riskPanel==='maintenance-history'){
  const history=(await load('meta/market_margin_history.json'))?.history??[],rows=history.filter(row=>Number.isFinite(row.maintenance_rate)&&/^\d{4}-\d{2}-\d{2}$/.test(row.date)).slice(-90),rates=rows.map(row=>row.maintenance_rate),low=Math.min(...rates),high=Math.max(...rates),span=high-low||1,points=rows.map((row,index)=>`${index/(Math.max(rows.length-1,1))*760},${10+(high-row.maintenance_rate)/span*140}`).join(' ');
  card=rows.length>1?ctx.card('融資維持率歷史・Public_Data',`<svg class="chart" viewBox="0 0 760 170" role="img" aria-label="最近 ${rows.length} 個來源交易日的融資維持率折線圖"><polyline points="${points}" fill="none" stroke="var(--orange)" stroke-width="3"/></svg><p class="source muted">${e(rows[0].date)} 至 ${e(rows.at(-1).date)}・來源歷史共 ${history.length} 筆。</p>`):ctx.card('融資維持率歷史・Public_Data','<p role="status">Public_Data 歷史資料不足以繪圖。</p>');
 }
 return card||'<p role="status">請選擇市場風險資料分頁。</p>';
}

export async function marketOverview(ctx,active='overview',panel='taiwan',section='risk',category='margin_pressure_highest',usSymbol='^SOX',riskPanel='margin-risk'){
 const {state,card,metric,link,favoriteButton=()=>''}=ctx;
 const selectedPanel=['taiwan','us','context'].includes(panel)?panel:'taiwan';
 const intraday=selectedPanel==='taiwan'?await indexIntradayBySymbol({publicData:ctx.publicData,state}):{};
 let liveQuotes={};
 try{
  if(selectedPanel==='taiwan')liveQuotes=await ctx.marketIndexQuotes?.(state)??{};
  else if(selectedPanel==='us')liveQuotes=await ctx.marketQuotes?.(state)??{};
 }catch{}
 const requestedIndexSymbols=new Set(['IX0001','IX0043','^DJI','^IXIC','^GSPC','^SOX','TSM']);
 const usIndexNames={'^DJI':'道瓊工業指數','^IXIC':'NASDAQ 綜合指數','^GSPC':'S&P 500 指數','^SOX':'費城半導體指數','TSM':'台積電 ADR'};
 const availableIndices=state.indices.filter(row=>requestedIndexSymbols.has(row.symbol));
 const presentUS=new Set(availableIndices.filter(row=>row.market==='US'||Object.hasOwn(usIndexNames,row.symbol)).map(row=>row.symbol));
 const indicesToRender=[...availableIndices,...Object.entries(usIndexNames).filter(([symbol])=>!presentUS.has(symbol)).map(([symbol,name])=>({symbol,name,market:'US',price:null,change:null,changePercent:null,asOf:null}))];
 const taiwanIndices=indicesToRender.filter(row=>['IX0001','IX0043'].includes(row.symbol));
 const usIndices=indicesToRender.filter(row=>Object.hasOwn(usIndexNames,row.symbol));
 const panelTabs=`<nav class="market-overview-tabs" aria-label="市場總覽分頁" role="tablist">${[['taiwan','市場總覽'],['us','美股'],['context','市場資訊']].map(([id,label])=>`<a role="tab" href="#/overview?panel=${id}"${selectedPanel===id?' aria-selected="true" tabindex="0"':' aria-selected="false" tabindex="-1"'}>${label}</a>`).join('')}</nav>`;
 const renderIndices=(rows,layout='')=>`<div class="tiles market-index-tiles ${layout}">${rows.map(sourceRow=>{const row={...sourceRow,...liveQuotes[sourceRow.symbol]};
  const exchange=row.symbol==='IX0001'?'TWSE':row.symbol==='IX0043'?'TPEX':null,exchangeRows=exchange?state.rows.filter(item=>item.market===exchange):[],priced=exchangeRows.filter(item=>Number.isFinite(item.changePercent)),up=priced.filter(item=>item.changePercent>0).length,down=priced.filter(item=>item.changePercent<0).length,flat=priced.length-up-down,turnoverRows=exchangeRows.filter(item=>Number.isFinite(item.turnover)&&item.turnover>=0),turnover=turnoverRows.reduce((sum,item)=>sum+item.turnover,0),change=Number.isFinite(row.change)?row.change:null,pct=Number.isFinite(row.changePercent)?row.changePercent:null;
  const indexLabel=row.symbol==='IX0001'?'TAIEX':row.symbol==='IX0043'?'OTC':e(row.symbol);
  const marketDate=exchangeDateLabel(row.market,row.asOf);
  const quoteSource=row.source==='Fugle'?`台灣 ${e(row.date)} ${e(row.time)}・Fugle・即時行情`:row.source==='Yahoo Finance'&&['IX0001','IX0043'].includes(row.symbol)?`台灣 ${e(row.date)} ${e(row.time)}・Yahoo Finance・${row.isIntraday?'可能延遲 15 分鐘，非即時':'今日收盤快照，非即時'}`:row.market==='US'&&row.source==='Yahoo Finance'?`美東 ${e(row.date)} ${e(row.time)}・Yahoo Finance・${row.isIntraday?'可能延遲 15 分鐘，非即時':'今日收盤快照，非即時'}`:row.market==='US'&&!row.price?'美東交易日期／Public_Data 報價資料不足':`${marketDate}・Public_Data 原始日線`;
  const stats=exchange?`<div class="market-index-stats">${metric('上漲家數',priced.length?String(up):'資料不足')}${metric('下跌家數',priced.length?String(down):'資料不足')}${metric('平盤家數',priced.length?String(flat):'資料不足')}${metric('已載行情成交值',turnoverRows.length?`${n(turnover/1e8,0)} 億`:'資料不足')}</div><p class="source muted">已載 ${turnoverRows.length} 檔該交易所行情，不代表該交易所完整成交金額。</p>`:'';
  return card(`${row.name} ${indexLabel}`,`${row.symbol==='TSM'?`<div class="toolbar"><a href="#/security?symbol=TSM">查看個股：${e(row.name)} TSM</a>${favoriteButton('TSM',row.name,'market-us-favorite-TSM')}</div>`:''}<div class="market-index-heading"><strong class="market-index-value">${n(row.price)}</strong><span class="market-index-change ${pct>0?'up':pct<0?'down':'muted'}">${change===null||pct===null?'漲跌資料不足':`${change>0?'+':''}${n(change)}　${pct>0?'+':''}${n(pct)}%`}</span></div><p class="source muted">${quoteSource}</p>${exchangeClockMarkup(row.market)}${intraday[row.symbol]??(exchange?'<p role="status">分時資料暫不可用</p>':'')}${stats}`);
 }).join('')}</div>`;
 const priced=state.rows.filter(row=>Number.isFinite(row.changePercent)),up=priced.filter(row=>row.changePercent>0).length,down=priced.filter(row=>row.changePercent<0).length,flat=priced.length-up-down,advancingRatio=priced.length?up/priced.length:0;
 const turnover=state.marketTurnover?.value,turnoverValue=Number.isFinite(turnover)?`${n(turnover/1e8,0)} 億`:'資料不足';
 const health=card('市場健康度',priced.length?`<div class="market-health-meter" role="img" aria-label="有參考價證券中上漲比例 ${n(advancingRatio*100,1)}%"><span style="width:${Math.max(0,Math.min(100,advancingRatio*100))}%"></span></div><div class="market-health-stats">${metric('漲跌家數',`${up}：${down}`)}${metric('漲跌比',down?`${n(up/down,2)}：1`:'下跌家數為 0')}${metric('平盤',String(flat))}</div><div class="market-health-stats">${metric('成交金額',turnoverValue)}${metric('漲跌停家數','來源未提供')}${metric('市場情緒指數','來源未提供')}</div><p class="source muted">漲跌家數以 ${priced.length} 檔具原始參考價證券計算・成交金額取自 Public_Data daily/tw/${e(state.marketTurnover?.date??'資料日期不足')}.json 的 ${state.marketTurnover?.rowCount??0} 筆完整原始行情列；這是公開行情檔成交金額合計，不代表交易所另行公布的全市場統計。未涵蓋者不計入平盤；情緒分數不推估。</p>`:`<p role="status">參考價資料不足，暫無法計算漲跌家數。原始行情日 ${e(state.index.latest_daily_tw??'日期不足')}・資格通過行情列 ${state.rows.length} 檔・具可驗證漲跌幅 ${priced.length} 檔。</p>`);
 const selectedUS=usIndices.find(row=>row.symbol===usSymbol)??usIndices.find(row=>row.symbol==='^SOX')??usIndices[0];
 const usTabs=`<nav class="market-us-index-tabs" aria-label="美股指數與 ADR">${usIndices.map(row=>`<a href="#/overview?panel=us&symbol=${encodeURIComponent(row.symbol)}"${selectedUS?.symbol===row.symbol?' aria-current="page"':''}>${row.symbol==='TSM'?'TSM ADR':e(row.name)}</a>`).join('')}</nav>`;
 let panelContent=selectedPanel==='taiwan'?renderIndices(taiwanIndices)+health:selectedPanel==='us'?usTabs+(selectedUS?renderIndices([selectedUS],'market-overview-us'):'<p role="status">美股指數與 ADR 資料不足。</p>'):await marketInformation(ctx,section,category,riskPanel);
 if(ctx.failureState)panelContent=`<section class="card state" role="status"><span class="state-icon" aria-hidden="true">!</span><h2>市場資料暫不可用</h2><p class="muted">保留 Public_Data 最新可用資料與來源日期；重新連線後可重試。</p><button data-action="reload">重試</button></section>${panelContent}`;
 if(selectedPanel==='context'){
  const infoTabs=`<nav class="market-info-tabs" aria-label="市場資訊分頁">${[['risk','風險與歷史'],['ranking','融資排行'],['calendar','交易日曆']].map(([id,label])=>`<a href="#/overview?panel=context&section=${id}"${section===id?' aria-current="page"':''}>${label}</a>`).join('')}</nav>`;
  const riskTabs=section==='risk'?`<nav class="market-info-tabs market-risk-tabs" aria-label="市場風險資料分頁">${riskPanels.map(([id,label])=>`<a href="#/overview?panel=context&section=risk&subsection=${id}"${riskPanel===id?' aria-current="page"':''}>${label}</a>`).join('')}</nav>`:'';
  panelContent=infoTabs+riskTabs+panelContent;
 }
 return marketTabs(active)+panelTabs+`<section class="market-overview-panel" role="tabpanel" aria-label="${selectedPanel==='taiwan'?'市場總覽':selectedPanel==='us'?'美股':'市場資訊'}">${panelContent}</section>`;
}
