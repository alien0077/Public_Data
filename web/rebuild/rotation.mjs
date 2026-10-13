import {escapeHTML as e,number as n,resolveListingStatus,taipeiDay} from './core.mjs';

// The caller supplies current-listing eligible rows; do not infer turnover from volume.
export function rotationGroups(rows){
 const groups=new Map();
 for(const row of rows){
  const name=(typeof row.sector==='string'?row.sector.trim():'')||'分類資料不足';
  if(!groups.has(name))groups.set(name,{id:name,name,rows:[],turnover:null,share:null,flow:null,turnoverCount:0,flowCount:0,count:0});
  const group=groups.get(name);group.rows.push(row);group.count++;
  if(Number.isFinite(row.turnover)&&row.turnover>=0){group.turnover=(group.turnover??0)+row.turnover;group.turnoverCount++;}
  if(Number.isFinite(row.price)&&row.price>0&&[row.foreignNet,row.trustNet,row.dealerNet].every(Number.isFinite)){
   const amount=(row.foreignNet+row.trustNet+row.dealerNet)*row.price*1000/1e8;
   if(Number.isFinite(amount)){group.flow=(group.flow??0)+amount;group.flowCount++;}
  }
 }
 const result=[...groups.values()],total=result.reduce((sum,g)=>sum+(g.turnover??0),0);
 for(const group of result){
  if(!Number.isFinite(group.turnover))group.turnover=null;
  if(!Number.isFinite(group.flow))group.flow=null;
  group.share=total>0&&Number.isFinite(total)&&group.turnover!==null?group.turnover/total*100:null;
 }
 return result.sort((a,b)=>a.turnover===null?(b.turnover===null?(a.name<b.name?-1:a.name>b.name?1:0):1):b.turnover===null?-1:b.turnover-a.turnover||(a.name<b.name?-1:a.name>b.name?1:0));
}

export function createRotationPage(ctx){
 const {state,card,metric,status,rowList}=ctx;let selected='';
 const facts=entries=>`<div class="metric-grid">${entries.map(([key,value])=>metric(key,e(value))).join('')}</div>`;
 function page(){
  const eligibleRows=state.rows.filter(row=>resolveListingStatus(row.symbol,taipeiDay(),state.listing).eligible);
  const groups=rotationGroups(eligibleRows),chosen=groups.find(g=>g.id===selected);
  if(!chosen)selected='';
  const validTurnover=groups.reduce((sum,g)=>sum+g.turnoverCount,0),validFlow=groups.reduce((sum,g)=>sum+g.flowCount,0);
  const header=card('產業成交觀察',facts([
   ['行情日期',state.index?.latest_daily_tw||'來源日期不足'],['資料來源','Public_Data 原始日行情；官方產業分類'],
   ['統計範圍',`目前上市資格通過名單，共 ${eligibleRows.length} 檔`],['成交額覆蓋',`${validTurnover} / ${eligibleRows.length} 檔`],['法人估算覆蓋',`${validFlow} / ${eligibleRows.length} 檔`]
  ])+'<p class="muted">成交占比＝產業有效原始成交金額 ÷ 本頁全部有效成交金額。缺值不當作零；分類缺值獨立列示。</p><p class="muted">法人淨額為估算值（億元）：（外資＋投信＋自營商淨買賣超張數）× 原始收盤價 × 1,000 ÷ 1 億。三項與價格完整才計入；不是實際成交買賣金額。</p>');
  const history=card('歷史輪動資料不足',facts([['5 日產業比較','資料不足'],['20 日產業比較','資料不足']])+'<p class="muted">目前呈現單日分布；尚無通過同一分類、上市資格與價格尺度核對的歷史比較序列。</p>');
  if(!groups.length)return header+status('尚無可統計行情','同步最新資料並確認上市資格後重試。')+history;
  const controls=card('產業篩選',`<label for="rotation-sector">選擇產業<select id="rotation-sector"><option value="">全部產業</option>${groups.map(g=>`<option value="${e(g.id)}" ${g.id===selected?'selected':''}>${e(g.name)}（${g.count} 檔）</option>`).join('')}</select></label><p class="muted">摘要依成交金額由高至低排列；選擇產業可查看成員。</p>`);
  const summaries=(chosen?[chosen]:groups).map(g=>card(g.name,`<div data-rotation-group="${e(g.id)}">${facts([
   ['成員',`${g.count} 檔`],['成交金額（億元）',g.turnover===null?'資料不足':n(g.turnover/1e8)],['成交占比',g.share===null?'資料不足':n(g.share)+'%'],
   ['法人估算（億元）',n(g.flow)],['成交額有效成員',`${g.turnoverCount} / ${g.count} 檔`],['法人估算有效成員',`${g.flowCount} / ${g.count} 檔`]
  ])}${g.share===null?'':`<div class="allocation-bar" role="img" aria-label="${e(g.name)}成交占比 ${n(g.share)}%"><i style="width:${Math.max(0,Math.min(100,g.share))}%"></i></div>`}<button type="button" data-rotation-select="${chosen?'':e(g.id)}">${chosen?'全部產業':'檢視成員'}</button></div>`)).join('');
  const members=chosen?`<div id="rotation-members">${card(`${chosen.name}成員`,rowList(chosen.rows,'rotation'))}</div>`:'';
  return header+controls+summaries+members+history;
 }
 function listen(app){
  app.addEventListener('change',event=>{if(event.target.id==='rotation-sector'){selected=event.target.value;ctx.refresh();}});
  app.addEventListener('click',event=>{const button=event.target.closest('[data-rotation-select]');if(button&&app.contains(button)){selected=button.dataset.rotationSelect;ctx.refresh();}});
 }
 return {page,listen};
}
