import {escapeHTML as e,number as n,resolveListingStatus,taipeiDay} from './core.mjs';

// The caller supplies rows from the current stocks.json universe; do not infer turnover from volume.
export function rotationGroups(rows){
 const groups=new Map();
 for(const row of rows){
  const name=(typeof row.sector==='string'?row.sector.trim():'')||'分類資料不足';
  if(!groups.has(name))groups.set(name,{id:name,name,rows:[],turnover:null,share:null,flow:null,averageChange:null,turnoverCount:0,flowCount:0,changeCount:0,changeTotal:0,count:0});
  const group=groups.get(name);group.rows.push(row);group.count++;
  if(Number.isFinite(row.turnover)&&row.turnover>=0){group.turnover=(group.turnover??0)+row.turnover;group.turnoverCount++;}
  if(Number.isFinite(row.changePercent)){group.changeTotal+=row.changePercent;group.changeCount++;}
  if(Number.isFinite(row.price)&&row.price>0&&[row.foreignNet,row.trustNet,row.dealerNet].every(Number.isFinite)){
   const amount=(row.foreignNet+row.trustNet+row.dealerNet)*row.price*1000/1e8;
   if(Number.isFinite(amount)){group.flow=(group.flow??0)+amount;group.flowCount++;}
  }
 }
 const result=[...groups.values()],total=result.reduce((sum,g)=>sum+(g.turnover??0),0);
 for(const group of result){
  if(!Number.isFinite(group.turnover))group.turnover=null;
  if(!Number.isFinite(group.flow))group.flow=null;
  group.averageChange=group.changeCount?group.changeTotal/group.changeCount:null;
  group.share=total>0&&Number.isFinite(total)&&group.turnover!==null?group.turnover/total*100:null;
 }
 return result.sort((a,b)=>a.turnover===null?(b.turnover===null?(a.name<b.name?-1:a.name>b.name?1:0):1):b.turnover===null?-1:b.turnover-a.turnover||(a.name<b.name?-1:a.name>b.name?1:0));
}

export function createRotationPage(ctx){
 const {state,card,metric,status,rowList,publicData,favoriteButton=()=>''}=ctx;let selected='',sectorPage=0,mode='sector',capitalSection='quadrant',flowCache=null,frameIndex=-1,playing=false,monthlyIndex=null,monthlyTheme='',monthlyData=null,monthlySelection=new Set(),monthlyError='';
 const facts=entries=>`<div class="metric-grid">${entries.map(([key,value])=>metric(key,e(value))).join('')}</div>`;
 const historyAction=typeof ctx.link==='function'?ctx.link('rotation-history','歷史產業輪動'):'';
 const monthlyAction=typeof ctx.link==='function'?ctx.link('sector-monthly-flow','族群月曲線'):'';
 async function fiveDayFlowSummary(){
  const latest=state.index?.latest_daily_tw;
  if(!latest)return [];
  if(flowCache?.date===latest)return flowCache.rows;
  const days=(state.index.available_days_tw??[]).filter(day=>/^\d{4}-\d{2}-\d{2}$/.test(day)&&day<=latest).sort().slice(-20);
  if(days.length<5)return [];
  const snapshots=await Promise.all(days.map(day=>publicData(`daily/tw/${day}.json`)));
  const eligible=new Map(state.rows.filter(row=>row.securityType!=='fund'&&resolveListingStatus(row.symbol,taipeiDay(),state.listing).eligible).map(row=>[row.symbol,row]));
  const grouped=new Map(),shortGrouped=new Map(),frames=[];
  for(const [snapshotIndex,snapshot] of snapshots.entries()){
   const dailyGroups=new Map();
   for(const raw of snapshot.stocks??[]){
    const row=eligible.get(String(raw.id));if(!row)continue;
    const sector=(row.sector||'').trim()||'分類資料不足';
    const item=grouped.get(sector)??{sector,amount:0,valid:0,total:0,change:0,changeCount:0,positive:0};item.total++;
    const isShort=snapshotIndex>=Math.max(0,snapshots.length-5),shortItem=shortGrouped.get(sector)??{sector,amount:0,valid:0,total:0};if(isShort)shortItem.total++;
    const point=dailyGroups.get(sector)??{sector,turnover:0,turnoverCount:0,change:0,changeCount:0,positiveCount:0,flow:0,flowCount:0,total:0};point.total++;
    if(Number.isFinite(raw.t)&&raw.t>=0){point.turnover+=raw.t;point.turnoverCount++;}
    if(Number.isFinite(raw.pct)){point.change+=raw.pct;point.changeCount++;item.change+=raw.pct;item.changeCount++;if(raw.pct>0){item.positive++;point.positiveCount++;}if(isShort)shortItem.change=(shortItem.change||0)+raw.pct;if(isShort)shortItem.changeCount=(shortItem.changeCount||0)+1;if(isShort&&raw.pct>0)shortItem.positive=(shortItem.positive||0)+1;}
    const price=raw.c,foreign=raw.f,trust=raw.it,dealer=raw.d;
    if([price,foreign,trust,dealer].every(Number.isFinite)&&price>0){const amount=(foreign+trust+dealer)*price*1000/1e8;if(Number.isFinite(amount)&&Number.isFinite(item.amount+amount)){item.amount+=amount;item.valid++;point.flow+=amount;point.flowCount++;if(isShort){shortItem.amount+=amount;shortItem.valid++;}}}
    grouped.set(sector,item);
    if(isShort)shortGrouped.set(sector,shortItem);
    dailyGroups.set(sector,point);
   }
   const points=[...dailyGroups.values()],totalTurnover=points.reduce((sum,p)=>sum+p.turnover,0);
   frames.push({date:snapshot.date||days[frames.length],groups:points.map(p=>({...p,share:totalTurnover>0?p.turnover/totalTurnover*100:null,averageChange:p.changeCount?p.change/p.changeCount:null})).filter(p=>p.turnoverCount>0).sort((a,b)=>b.turnover-a.turnover)});
  }
  const sortFlows=values=>[...values.values()].filter(row=>row.valid>0).sort((a,b)=>b.amount-a.amount||(a.sector<b.sector?-1:a.sector>b.sector?1:0));
  const rows=sortFlows(shortGrouped),longRows=days.length>=20?sortFlows(grouped).map(row=>({...row,averageChange:row.changeCount?row.change/row.changeCount:null,breadth:row.changeCount?row.positive/row.changeCount:null})):[];
  flowCache={date:latest,rows,longRows,frames};if(frameIndex<0)frameIndex=frames.length-1;return rows;
 }
 function rotationVisuals(){
  const frames=flowCache?.frames??[],frame=frames[Math.max(0,Math.min(frameIndex<0?frames.length-1:frameIndex,frames.length-1))];
  if(!frame?.groups?.length){if(capitalSection==='five-day')return '';const sections={quadrant:['資金輪動象限・逐日回放','當日行情／現行名冊資料不足','Public_Data stocks.json 現行名冊或逐日行情欄位不足，暫不繪製氣泡與播放控制。'],heatmap:['族群成交熱力圖','族群熱力圖資料不足','當日沒有 stocks.json 現行名冊內、具產業分類與有效原始成交金額的成分。'],strength:['主題強弱清單・依成交占比排序','主題強弱資料不足','此交易日沒有有效原始成交值或現行股票名冊資料。'],mainline:['20 日資金主線・可驗證觀察','20 日主線資料不足','需 20 個已發布交易日的原始行情、法人淨張數與目前 stocks.json 股票名冊；缺值不以零或舊名冊補齊。']};const [title,headline,message]=sections[capitalSection]||sections.quadrant;return card(title,status(headline,message,'◌',true));}
  const shown=frame.groups.slice(0,30),maxShare=Math.max(1,...shown.map(x=>x.share??0)),maxChange=Math.max(1,...shown.map(x=>Math.abs(x.averageChange??0)));
  const width=640,height=310,left=54,right=18,top=24,bottom=42,plotW=width-left-right,plotH=height-top-bottom;
  const dots=shown.map(g=>{const x=left+(g.share??0)/maxShare*plotW,y=top+(maxChange-(g.averageChange??0))/(2*maxChange)*plotH,r=Math.max(5,Math.min(25,Math.sqrt((g.turnover||0)/Math.max(1,...shown.map(x=>x.turnover||0)))*24));const color=(g.averageChange??0)>0?'var(--up)':(g.averageChange??0)<0?'var(--down)':'var(--muted)';return `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}" fill-opacity=".78"><title>${e(g.sector)}：成交占比 ${n(g.share)}%，平均漲跌 ${n(g.averageChange)}%，有效 ${g.changeCount}/${g.total} 檔</title></circle><text x="${x}" y="${y-r-3}" text-anchor="middle">${e(g.sector.slice(0,8))}</text>`;}).join('');
  const grid=[0,.25,.5,.75,1].map(t=>`<line class="grid" x1="${left}" x2="${width-right}" y1="${top+t*plotH}" y2="${top+t*plotH}"/><line class="grid" x1="${left+t*plotW}" x2="${left+t*plotW}" y1="${top}" y2="${top+plotH}"/>`).join('');
  const scatter=`<svg class="rotation-quadrant" viewBox="0 0 ${width} ${height}" role="img" aria-label="${frame.date} 產業資金輪動象限；橫軸成交占比，縱軸平均漲跌幅">${grid}${dots}<text x="${left+plotW/2}" y="${height-5}" text-anchor="middle">成交占比（%）</text><text x="12" y="${top+plotH/2}" transform="rotate(-90 12 ${top+plotH/2})" text-anchor="middle">平均漲跌幅（%）</text></svg>`;
  const cells=shown.map(g=>`<div class="rotation-treemap-tile" style="--tile-share:${Math.max(1,Math.min(40,g.share??1))};--tile-cols:${Math.max(1,Math.round((g.share??0)/100*12))};--tile-rows:${Math.max(1,Math.round(Math.sqrt((g.share??0)/100*24)))};--tile-change:${(g.averageChange??0)>0?'var(--up)':(g.averageChange??0)<0?'var(--down)':'var(--muted)'}" role="img" aria-label="${e(g.sector)}，成交占比 ${n(g.share)}%，漲跌 ${n(g.averageChange)}%"><strong>${e(g.sector)}</strong><span>${n(g.share)}%</span><small>${n(g.averageChange)}%</small></div>`).join('');
  const flows=flowCache.rows.slice(0,12).map(g=>{const current=frame.groups.find(x=>x.sector===g.sector);return `<div class="rotation-mainline-row"><strong>${e(g.sector)}</strong><span class="${g.amount>0?'up':g.amount<0?'down':''}">${g.amount>0?'+':''}${n(g.amount)} 億</span><small>五日有效 ${g.valid}/${g.total}・當日占比 ${n(current?.share)}%・平均漲跌 ${n(current?.averageChange)}%</small></div>`;}).join('');
  const longFlows=flowCache.longRows.slice(0,12).map(g=>{const current=frame.groups.find(x=>x.sector===g.sector);return `<div class="rotation-mainline-row"><strong>${e(g.sector)}</strong><span class="${g.amount>0?'up':g.amount<0?'down':''}">${g.amount>0?'+':''}${n(g.amount)} 億</span><small>20日有效 ${g.valid}/${g.total}・漲幅日占比 ${n((g.breadth??0)*100)}%・當日成交占比 ${n(current?.share)}%</small></div>`;}).join('');
  const strength=[...frame.groups].filter(g=>Number.isFinite(g.share)).sort((a,b)=>b.share-a.share||a.sector.localeCompare(b.sector)).slice(0,30).map((g,index)=>`<div class="rotation-mainline-row" data-rotation-strength="${e(g.sector)}"><strong>${String(index+1).padStart(2,'0')}・${e(g.sector)}</strong><span>${n(g.share)}%</span><small>成交占比・平均原始市價漲跌 ${g.averageChange>0?'+':''}${n(g.averageChange)}%・${g.changeCount}/${g.total} 檔</small></div>`).join('');
  const panels={
   quadrant:card('資金輪動象限・逐日回放',`<p class="muted">${e(frame.date)}・X 軸成交占比・Y 軸產業成員平均原始市價漲跌幅・氣泡面積依成交額。證券範圍依 Public_Data stocks.json 現行名冊。</p>${scatter}<div class="toolbar rotation-playback"><button type="button" data-rotation-play>${playing?'暫停回放':'播放回放'}</button><input aria-label="資金輪動日期" type="range" min="0" max="${Math.max(0,frames.length-1)}" value="${frameIndex}" data-rotation-frame ${frames.length<2?'disabled':''}><output>${Math.max(0,frameIndex)+1}/${frames.length} 個交易日</output></div>`),
   heatmap:card('族群成交熱力圖',`<p class="muted">區塊以成交占比近似面積；顏色依平均原始市價漲跌幅。資料日 ${e(frame.date)}。</p><div class="rotation-treemap">${cells}</div>`),
   strength:card('主題強弱清單・依成交占比排序',`<p class="muted">按所選交易日有效原始成交金額占比排序；漲跌採原始市價。證券範圍依 Public_Data stocks.json 現行名冊。</p>${strength||status('主題強弱資料不足','此交易日沒有有效原始成交值或現行股票名冊資料。','◌',true)}`),
   mainline:card('20 日資金主線・可驗證觀察',`<p class="muted">依 20 個已發布交易日原始法人與價格估算；漲幅日占比為有效證券日中上漲的比例，不代表預測或主力實際成交。</p>${longFlows||'<p class="muted">最近 20 個交易日的原始資料不足，暫不顯示長期排序。</p>'}`),
   'five-day':card('近五日資金主線・資料觀察',`<p class="muted">近五個交易日法人淨額估算排序；不是長期主線或預測。</p>${flows||'<p class="muted">法人資料不足。</p>'}`)
  };
  return panels[capitalSection]||panels.quadrant;
 }
 async function monthlyPanel(){
  if(!monthlyIndex){try{monthlyIndex=await publicData('quant/sector_monthly_flow/index.json');monthlyTheme=monthlyIndex.themes?.[0]||'';}catch(error){monthlyError=error?.message||'族群月度索引載入失敗';return card('族群月度資金流',status('Public_Data 月度索引不足',e(monthlyError)));}}
  if(monthlyTheme&&!monthlyData){try{const raw=await publicData(`quant/sector_monthly_flow/${encodeURIComponent(monthlyTheme)}.json`);if(raw.theme!==monthlyTheme||!Array.isArray(raw.dates)||!Array.isArray(raw.stocks_data)||raw.stocks_data.some(stock=>stock.cumulative_return?.length!==raw.dates.length))throw Error('族群月度序列長度或名稱不一致');monthlyData=raw;monthlySelection=new Set(raw.stocks_data.filter(stock=>stock.default_visible&&resolveListingStatus(stock.stock_id,taipeiDay(),state.listing).eligible).slice(0,5).map(stock=>stock.stock_id));}catch(error){monthlyError=error?.message||'族群月度資料載入失敗';}}
  const themes=monthlyIndex?.themes??[],stocks=(monthlyData?.stocks_data??[]).filter(stock=>resolveListingStatus(stock.stock_id,taipeiDay(),state.listing).eligible);
  const series=stocks.filter(stock=>monthlySelection.has(stock.stock_id));
  const width=640,height=260,left=48,right=16,top=18,bottom=36,values=series.flatMap(stock=>stock.cumulative_return.filter(Number.isFinite)),min=Math.min(0,...values),max=Math.max(0,...values),span=max-min||1;
  const colors=['var(--blue)','var(--up)','#d6a448','#9a76de','#4ca88a','#ed7894'];
  const lines=series.map((stock,index)=>{const points=stock.cumulative_return.map((value,i)=>Number.isFinite(value)?`${left+i*(width-left-right)/Math.max(1,monthlyData.dates.length-1)},${top+(max-value)*((height-top-bottom)/span)}`:null).filter(Boolean).join(' ');return `<polyline points="${points}" fill="none" stroke="${colors[index%colors.length]}" stroke-width="2"><title>${e(stock.stock_name)} ${e(stock.stock_id)}</title></polyline>`;}).join('');
  const flowValues=monthlyData?.industry_net_flow??[],flowMax=Math.max(1,...flowValues.filter(Number.isFinite).map(Math.abs)),flowZero=120,flowScale=88/flowMax;
  const flowBars=monthlyData&&flowValues.length===monthlyData.dates.length?monthlyData.dates.map((date,index)=>{const value=flowValues[index];if(!Number.isFinite(value))return '';const x=left+index*(width-left-right)/Math.max(1,monthlyData.dates.length-1),barHeight=Math.max(1,Math.abs(value)*flowScale),y=value>=0?flowZero-barHeight:flowZero;return `<rect x="${x-5}" y="${y}" width="10" height="${barHeight}" rx="2" fill="${value>=0?'var(--blue)':'var(--down)'}"><title>${e(date)}・族群法人淨流向 ${value>0?'+':''}${n(value)} 億元</title></rect>`;}).join(''):'';
  const flowChart=monthlyData&&flowBars?`<svg class="rotation-quadrant" viewBox="0 0 ${width} 240" role="img" aria-label="${e(monthlyTheme)} 族群法人每日淨流向，單位億元；Public_Data 來源發布值"><line class="grid" x1="${left}" x2="${width-right}" y1="${flowZero}" y2="${flowZero}"/><text x="${left-6}" y="${flowZero-4}" text-anchor="end">0</text>${flowBars}${monthlyData.dates.map((date,index)=>index%Math.ceil(monthlyData.dates.length/6)===0||index===monthlyData.dates.length-1?`<text x="${left+index*(width-left-right)/Math.max(1,monthlyData.dates.length-1)}" y="232" text-anchor="middle">${e(date.slice(5))}</text>`:'').join('')}</svg>`:'';
  const legend=series.map((stock,index)=>`<a class="rotation-stock-link" style="color:${colors[index%colors.length]}" href="#/security?symbol=${encodeURIComponent(stock.stock_id)}">● ${e(stock.stock_name)} ${e(stock.stock_id)}</a>${favoriteButton(stock.stock_id,stock.stock_name,'rotation-monthly-'+stock.stock_id)}`).join(' ');
  const options=themes.map(theme=>`<option value="${e(theme)}" ${theme===monthlyTheme?'selected':''}>${e(theme)}</option>`).join('');
  const choices=stocks.map(stock=>`<div class="rotation-stock-choice"><label><input type="checkbox" data-rotation-month-stock="${e(stock.stock_id)}" ${monthlySelection.has(stock.stock_id)?'checked':''}><span>${e(stock.stock_name)} ${e(stock.stock_id)}</span></label><a class="rotation-stock-link" href="#/security?symbol=${encodeURIComponent(stock.stock_id)}" aria-label="查看個股：${e(stock.stock_name)} ${e(stock.stock_id)}">查看個股</a>${favoriteButton(stock.stock_id,stock.stock_name,'rotation-choice-'+stock.stock_id)}</div>`).join('');
  return card('族群月度資金流・Public_Data',`<p class="muted">索引日期 ${e(monthlyIndex?.date||'日期不足')}・序列日期 ${e(monthlyData?.dates?.[0]||'日期不足')} ～ ${e(monthlyData?.dates?.at(-1)||'日期不足')}</p><label>族群<select data-rotation-month-theme>${options}</select></label>${monthlyError?status('族群資料載入失敗',e(monthlyError)):''}${monthlyData?`<p class="muted">藍／紅柱為 Public_Data 已發布的族群法人淨流向原值（億元）；依目前 meta/stocks.json 與主題分類產生。分類不代表當時歷史成分，來源缺逐日貢獻 lineage，僅供觀察，不構成 PIT/OOS 認證。</p>${flowChart}<div class="rotation-month-legend">${legend||'請選擇族群成員'}</div><svg class="rotation-quadrant" viewBox="0 0 ${width} ${height}" role="img" aria-label="${e(monthlyTheme)} 成員累積報酬來源原值曲線">${[0,.25,.5,.75,1].map(t=>`<line class="grid" x1="${left}" x2="${width-right}" y1="${top+t*(height-top-bottom)}" y2="${top+t*(height-top-bottom)}"/>`).join('')}${lines}</svg><div class="rotation-month-stock-list">${choices}</div>`:status('族群月度曲線資料不足','此族群目前沒有可驗證的成員序列。')}`);
 }
 function flowChart(rows){
  const shown=rows.slice(0,10);if(!shown.length)return status('五日資金流向資料不足','最近五個交易日沒有可核對的原始收盤價與三法人淨張數。','↗',true);
  const maximum=Math.max(1,...shown.map(row=>Math.abs(row.amount))),center=270,scale=180/maximum,height=48+shown.length*30;
  const bars=shown.map((row,index)=>{const y=24+index*30,width=Math.abs(row.amount)*scale,x=row.amount>=0?center:center-width,label=row.sector.length>6?`${row.sector.slice(0,5)}…`:row.sector;return `<text x="4" y="${y+14}"><title>${e(row.sector)}</title>${e(label)}</text><rect x="${x}" y="${y}" width="${Math.max(1,width)}" height="18" rx="3" fill="${row.amount>=0?'var(--up)':'var(--down)'}"><title>${e(row.sector)}：${row.amount>0?'+':''}${n(row.amount)} 億元；有效證券日 ${row.valid}/${row.total}</title></rect><text x="${row.amount>=0?x+width+5:x-5}" y="${y+14}" text-anchor="${row.amount>=0?'start':'end'}">${row.amount>0?'+':''}${n(row.amount)}</text>`;}).join('');
  const coverage=shown.reduce((sum,row)=>sum+row.valid,0),total=shown.reduce((sum,row)=>sum+row.total,0);
  return `<svg class="rotation-flow-chart" viewBox="0 0 500 ${height}" role="img" aria-label="近五個交易日產業法人淨額估算，單位億元；紅色為淨買超，綠色為淨賣超">${[center-180,center,center+180].map(x=>`<line x1="${x}" x2="${x}" y1="14" y2="${height-22}" stroke="var(--line)"/>`).join('')}${bars}<line x1="${center-180}" x2="${center+180}" y1="${height-22}" y2="${height-22}" stroke="var(--line)"/><text x="${center-180}" y="${height-5}" text-anchor="middle">−${n(maximum)}</text><text x="${center}" y="${height-5}" text-anchor="middle">0</text><text x="${center+180}" y="${height-5}" text-anchor="middle">+${n(maximum)}</text><text x="496" y="${height-5}" text-anchor="end">億元</text></svg><p class="muted">每個證券日僅在原始收盤價及外資、投信、自營商淨張數皆有效時納入。有效樣本 ${coverage}/${total} 筆；數值為估算，不代表全市場實際資金流。</p>`;
 }
 async function page(){
  const eligibleRows=state.rows.filter(row=>row.securityType!=='fund'&&resolveListingStatus(row.symbol,taipeiDay(),state.listing).eligible);
  const groups=rotationGroups(eligibleRows),chosen=groups.find(g=>g.id===selected);
  let flowRows=[];if(mode==='capital'){try{flowRows=await fiveDayFlowSummary();}catch{}}
  if(!chosen)selected='';
  const validTurnover=groups.reduce((sum,g)=>sum+g.turnoverCount,0),validFlow=groups.reduce((sum,g)=>sum+g.flowCount,0);
  const header=card('資金輪動・資料範圍',facts([
   ['行情日期',state.index?.latest_daily_tw||'來源日期不足'],['資料來源','Public_Data 原始日行情；依目前官方產業分類回看'],
   ['統計範圍',`Public_Data stocks.json 現行名冊，共 ${eligibleRows.length} 檔`],['成交額覆蓋',`${validTurnover} / ${eligibleRows.length} 檔`],['法人估算覆蓋',`${validFlow} / ${eligibleRows.length} 檔`]
  ])+'<p class="muted">成交占比＝產業有效原始成交金額 ÷ 本頁全部有效成交金額。缺值不當作零；分類缺值獨立列示。</p><p class="muted">法人淨額為估算值（億元）：（外資＋投信＋自營商淨買賣超張數）× 原始收盤價 × 1,000 ÷ 1 億。三項與價格完整才計入；不是實際成交買賣金額。</p>');
  const fiveDayFlowStatus=mode==='capital'?(flowRows.length
   ? `近 5 日法人估算已有 ${flowRows.length} 個產業具有效資料；`
   : '近 5 日沒有可驗證的法人金額估算，因現行名冊、原始價格或法人資料覆蓋不足；'):'近五日法人估算請至「資金流向 → 五日流向」查看；';
  const history=card('歷史產業輪動',facts([['20 日產業比較','資料不足']])+`<p class="muted">${fiveDayFlowStatus}尚無通過同一分類、stocks.json 現行名冊與價格尺度核對的 20 日成交比較序列。</p>${historyAction}`);
  const modePanel=card('輪動分析','<div class="toolbar" role="group" aria-label="資金輪動模式">'+[['sector','產業輪動'],['capital','資金流向'],['risk','大盤風險']].map(([value,label])=>'<button type="button" data-rotation-mode="'+value+'" aria-pressed="'+(mode===value)+'" class="'+(mode===value?'primary':'')+'">'+label+'</button>').join('')+'</div>');
  const capitalTabs=card('資金流向頁面','<div class="rotation-sector-tabs" role="group" aria-label="資金流向分頁">'+[['quadrant','象限回放'],['heatmap','族群熱力圖'],['strength','主題強弱'],['mainline','長期主線'],['five-day','五日流向']].map(([value,label])=>'<button type="button" data-rotation-section="'+value+'" aria-pressed="'+(capitalSection===value)+'" class="'+(capitalSection===value?'primary':'')+'">'+label+'</button>').join('')+monthlyAction+'</div>');
  const flowPanel=card('產業資金流向（近 5 日）',`<p class="muted">單位：估算億元・依有效淨額由高至低排列</p>${flowChart(flowRows)}`);
  if(mode==='risk')return header+modePanel+status('大盤風險資料不足','目前 canonical 資料沒有通過驗證的市場風險序列；不以單日成交或法人估算代替風險指標。');
  if(mode==='capital')return header+modePanel+capitalTabs+rotationVisuals()+(capitalSection==='five-day'?flowPanel:'');
  if(!groups.length)return header+modePanel+status('尚無可統計行情','同步 Public_Data stocks.json、日行情與產業分類後重試。')+history;
  if(chosen){
   const detail=card(chosen.name,`<button type="button" data-rotation-back>返回產業排行</button><div data-rotation-group="${e(chosen.id)}">${facts([
    ['成員',`${chosen.count} 檔`],['成交金額（億元）',chosen.turnover===null?'資料不足':n(chosen.turnover/1e8)],['成交占比',chosen.share===null?'資料不足':n(chosen.share)+'%'],
    ['法人估算（億元）',n(chosen.flow)],['成交額有效成員',`${chosen.turnoverCount} / ${chosen.count} 檔`],['法人估算有效成員',`${chosen.flowCount} / ${chosen.count} 檔`]
   ])}${chosen.share===null?'':`<div class="allocation-bar" role="img" aria-label="${e(chosen.name)}成交占比 ${n(chosen.share)}%"><i style="width:${Math.max(0,Math.min(100,chosen.share))}%"></i></div>`}</div>`);
   return header+modePanel+detail+card(`${chosen.name}成員`,rowList(chosen.rows,'rotation'))+history;
  }
  const pageSize=10,pageCount=Math.max(1,Math.ceil(groups.length/pageSize));sectorPage=Math.min(sectorPage,pageCount-1);
  const start=sectorPage*pageSize,shown=groups.slice(start,start+pageSize);
  const rankRows=shown.map((g,index)=>`<button type="button" class="rotation-rank-row" data-rotation-sector="${e(g.id)}" aria-label="查看產業 ${e(g.name)}"><span class="rotation-rank-number">${String(start+index+1).padStart(2,'0')}</span><span class="rotation-rank-info"><strong>${e(g.name)}</strong><small>${g.count} 檔・成交占比</small></span><span class="rotation-rank-metrics"><b>${g.share===null?'資料不足':n(g.share)+'%'}</b><small class="${g.averageChange===null?'muted':g.averageChange>=0?'up':'down'}">${g.averageChange===null?'資料不足':(g.averageChange>0?'+':'')+n(g.averageChange)+'%'}</small></span><span aria-hidden="true">›</span></button>`).join('');
  const paging=pageCount>1?`<nav class="rotation-rank-paging" aria-label="產業排行分頁"><button type="button" data-rotation-page="prev" ${sectorPage===0?'disabled':''}>上一頁</button><span>第 ${sectorPage+1}／${pageCount} 頁・${start+1}–${Math.min(start+pageSize,groups.length)}／${groups.length} 個產業</span><button type="button" data-rotation-page="next" ${sectorPage>=pageCount-1?'disabled':''}>下十檔</button></nav>`:'';
  const ranking=card('主題強弱清單・依成交占比排序',`<p class="muted">每頁 10 個產業；依有效原始成交金額占比排序。點選產業查看成員與個股。</p><div class="rotation-rank-list">${rankRows}</div>${paging}${historyAction}`);
  return header+modePanel+ranking+history;
 }
 function listen(app){
  app.addEventListener('click',event=>{const button=event.target.closest('[data-rotation-mode]');if(button){mode=button.dataset.rotationMode;ctx.refresh();}});
  app.addEventListener('click',event=>{const button=event.target.closest('[data-rotation-section]');if(button){capitalSection=button.dataset.rotationSection;ctx.refresh();}});
  app.addEventListener('click',event=>{const button=event.target.closest('[data-rotation-sector]');if(button){selected=button.dataset.rotationSector;ctx.refresh();}});
  app.addEventListener('click',event=>{const button=event.target.closest('[data-rotation-page]');if(button){sectorPage=Math.max(0,sectorPage+(button.dataset.rotationPage==='next'?1:-1));ctx.refresh();}});
  app.addEventListener('click',event=>{if(event.target.closest('[data-rotation-back]')){selected='';ctx.refresh();}});
  app.addEventListener('change',event=>{if(event.target.id==='rotation-sector'){selected=event.target.value;ctx.refresh();}});
  app.addEventListener('change',event=>{if(event.target.matches('[data-rotation-frame]')){frameIndex=Number(event.target.value);ctx.refresh();}});
  app.addEventListener('change',async event=>{if(event.target.matches('[data-rotation-month-theme]')){monthlyTheme=event.target.value;monthlyData=null;monthlyError='';await ctx.refresh();return;}if(event.target.matches('[data-rotation-month-stock]')){const symbol=event.target.dataset.rotationMonthStock;if(event.target.checked)monthlySelection.add(symbol);else monthlySelection.delete(symbol);ctx.refresh();}});
  app.addEventListener('click',event=>{if(!event.target.closest('[data-rotation-play]'))return;playing=!playing;ctx.refresh();if(playing){const timer=setInterval(()=>{if(!playing){clearInterval(timer);return;}const count=flowCache?.frames?.length||0;if(count<2){playing=false;clearInterval(timer);return;}frameIndex=(frameIndex+1)%count;ctx.refresh();},1000);}});
  app.addEventListener('click',event=>{const button=event.target.closest('[data-rotation-select]');if(button&&app.contains(button)){selected=button.dataset.rotationSelect;ctx.refresh();}});
 }
 async function monthlyPage(){return await monthlyPanel();}
 return {page,monthlyPage,listen};
}
