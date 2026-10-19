import {escapeHTML as e,identity} from './core.mjs';
import {preflight,verifyBackup,mergeBackup,previewLegacyBackup,convertLegacyBackup,readTrades,latestRestoreRecord,rollbackRestore} from './storage.mjs?v=2';

import {previewIOSBackup,convertCompatiblePreview,extractPDFText,previewCooperativePDF} from './import-compat.mjs?v=3';
import {transactionStockActions} from './transaction-actions.mjs?v=1';

export function createTransferModule(ctx){
 let pending=null,legacy=null,compatible=null,preview=null,result=null,error='',merging=false,reading=false,pdfFile=null,selectedFile=null,selectedFormat='backup',resultFilter='all';
 const recordCount=value=>Array.isArray(value)?value.length:value&&typeof value==='object'?Object.keys(value).length:0;
 const routeID=()=>decodeURIComponent((location.hash.split('?')[0].split('/')[1]??'').trim());
 const handles=id=>['backup','import','restore','import-preview','import-result'].includes(id);
 const stockIdentity=(symbol,savedName='')=>{const code=String(symbol??'').trim()||'資料不足';return identity(code,ctx.state.rows.find(row=>row.symbol===code),ctx.state.checkpoint?.learnedStocks?.[code],{name:savedName},ctx.state.listing?.stocks?.[code]);};
 async function page(id){
  const {card,metric,status,link,favoriteButton=()=>''}=ctx;
  if(id==='import')return card('匯入交易',`<p>選擇匯入來源，檔案會先在本機檢查；確認預覽後才合併至目前資料。</p><div class="transfer-format-grid" role="group" aria-label="選擇匯入格式"><button type="button" class="transfer-format ${selectedFormat==='backup'?'selected':''}" data-transfer-format="backup" aria-pressed="${selectedFormat==='backup'}"><span aria-hidden="true">▤</span><strong>備份檔匯入</strong><small>JSON／.twstk</small></button><button type="button" class="transfer-format ${selectedFormat==='pdf'?'selected':''}" data-transfer-format="pdf" aria-pressed="${selectedFormat==='pdf'}"><span aria-hidden="true">▧</span><strong>PDF 匯入</strong><small>合庫證券對帳單</small></button></div><label>選擇${selectedFormat==='pdf'?'PDF':'備份檔案'}<input id="rebuild-transfer-file" type="file" accept="${selectedFormat==='pdf'?'.pdf,application/pdf':'.json,.twstk,application/json'}" ${reading?'disabled':''}></label>${selectedFile?`<div class="transfer-file-summary"><strong>${e(selectedFile.name)}</strong><small>${e(selectedFile.kind)}・${e(selectedFile.size)}${selectedFile.integrity?`・${e(selectedFile.integrity)}`:''}</small><button type="button" data-transfer-remove>移除檔案</button></div>`:''}<button class="primary" type="button" data-transfer-next ${(!pending&&!legacy&&!compatible&&!pdfFile)||reading?'disabled':''}>下一步：匯入預覽</button><p role="status" class="${error?'alert':'muted'}">${e(reading?'正在本機解析檔案…':error)}</p><p class="muted">原有紀錄會保留；服務金鑰不會匯入。</p>`);
  if(id==='backup')return card('備份與還原',`<button class="primary" data-action="backup">建立並匯出完整備份</button><label>選擇備份或合庫 PDF<input id="rebuild-transfer-file" type="file" accept=".json,.twstk,.pdf,application/json,application/pdf" ${reading?'disabled':''}></label><p class="muted">支援 Web v2 完整備份及 Web v1 舊備份。讀取後先預覽，確認才合併；原有紀錄保留。也支援 iOS .twstk／交易 JSON 與具完整表頭的合庫文字 PDF；跨格式只匯入交易。</p><div class="stack">${link('restore','還原預覽')}${link('upgrade','原地升級')}</div><p role="status" class="${error?'alert':'muted'}">${e(reading?'正在本機解析檔案…':error)}</p>`);
  if(id==='import-preview'&&pdfFile&&!compatible)return card('合庫證券 PDF',`<p>${e(pdfFile.name)}</p><label>PDF 密碼（若有）<input id="rebuild-pdf-password" type="password" autocomplete="off" aria-label="PDF 密碼（若有）" ${reading?'disabled':''}></label><button type="button" class="primary" data-transfer-read-pdf ${reading?'disabled':''}>${reading?'本機解析中…':'解析並預覽'}</button><p role="status" class="${error?'alert':'muted'}">${e(error)}</p><p class="muted">密碼只用於本次本機解鎖，不保存至偏好或備份。</p>`);
  if(id==='import-result'){
   if(!result){const saved=await latestRestoreRecord();if(!saved)return status('尚未執行還原','先選擇並確認備份。')+card('',link('import'));const rollbackAction=saved.status==='RESTORABLE'?`<button class="primary" data-transfer-rollback data-hash="${e(saved.hash)}">撤銷最近一次備份合併</button><p class="muted">若匯入交易或偏好已被修改，系統會停止撤銷並保留資料。</p>`:`<p role="status">已於 ${e(saved.rollback.completedAt??'時間不足')} 撤銷；移除 ${e(saved.rollback.removed)} 筆匯入交易、還原 ${e(saved.rollback.revertedPreferences)} 項偏好。安全日誌已保留。</p>`;return card('最近一次還原紀錄',`<div class="metric-grid">${metric('已新增交易',String(saved.added))}${metric('略過交易',String(saved.skipped))}${metric('券商原始明細',String(saved.legacySourceCounts.normalizedTrades))}${metric('年度結算記錄',String(saved.legacySourceCounts.annualSettledRecords))}${metric('還原狀態',saved.status==='RESTORABLE'?'可撤銷':'已撤銷')}</div><p class="source muted">完成時間：${e(saved.completedAt??'時間不足')}・來源 checkpoint：${e(saved.beforeHash)}</p>${rollbackAction}<p role="status" class="${error?'alert':'muted'}">${e(error)}</p>`)+card('',link('import'));}
   const filters=[['all',`全部 ${result.entries.length}`],['added',`已匯入 ${result.added}`],['skipped',`已略過 ${result.skipped}`],['failed','匯入失敗 0']];
   const visible=result.entries.filter(row=>resultFilter==='all'||row.status===resultFilter);
   const rows=visible.map((item,index)=>{const trade=item.trade,stock=stockIdentity(String(trade.symbol??trade.stock_id??''),trade.name??trade.stockName??'');const label=item.status==='added'?'已匯入':'已略過';return `<article class="card transfer-result-row"><div class="transfer-result-heading">${transactionStockActions(stock.symbol,stock.name,`transfer-result-${index}-${stock.symbol}`,favoriteButton)}<span class="pill">${label}</span></div><small>${e(trade.date)}・${e(trade.type)}</small><div class="transfer-result-values"><span>股數 ${e(trade.shares)}</span><span>單價 ${e(trade.price)}</span><span>幣別 ${e(trade.currency||'未記錄')}</span><span>手續費 ${e(trade.fee)}</span><span>交易稅 ${e(trade.tax)}</span></div></article>`;}).join('');
   const tabs=`<div class="transfer-result-tabs" role="group" aria-label="匯入結果分類">${filters.map(([id,label])=>`<button type="button" data-transfer-result-filter="${id}" aria-pressed="${resultFilter===id}">${label}</button>`).join('')}</div>`;
   const rollbackAction=result.rollback?`<p role="status">已撤銷：移除 ${e(result.rollback.removed)} 筆本次新增交易、還原 ${e(result.rollback.revertedPreferences)} 項偏好。</p>`:result.restoreHash?`<button type="button" data-transfer-rollback data-hash="${e(result.restoreHash)}">撤銷本次備份合併</button><p class="muted">若匯入交易或偏好已被修改，系統會停止撤銷並保留資料。</p>`:'';
   const body=`<div class="metric-grid">${metric('已匯入',String(result.added))}${metric('已略過',String(result.skipped))}${metric('券商原始明細',String(result.legacySourceCounts?.normalizedTrades??0))}${metric('年度結算記錄',String(result.legacySourceCounts?.annualSettledRecords??0))}${metric('匯入失敗','0')}</div><p class="source muted">完成時間：${e(result.completedAt??'時間不足')}・來源 checkpoint：${e(result.beforeHash)}</p><p>合併完成並保留原有紀錄。若本次新增的交易或偏好已被後續修改，系統會拒絕撤銷並保留資料。</p>${rollbackAction}${tabs}${rows?`<div class="transfer-result-list">${rows}</div>`:'<p class="muted">此分類沒有項目。</p>'}`;
   return card('匯入結果',body)+card('',link('transactions'));
  }
  if(!pending&&!legacy&&!compatible)return status('尚未選擇備份','請先選擇 Web 備份檔案。')+card('',link('import'));
  const trades=compatible?.trades??legacy?.trades??pending.trades,groups=compatible?.favorites??legacy?.favorites??pending.favorites;
  const legacyNotice=legacy?`<p class="alert">${e(preview.warning)}</p><label class="toolbar"><input type="checkbox" id="rebuild-legacy-favorites" style="width:auto">我已核對下方自選內容，同意納入沒有 checksum 保護的自選資料</label>`:'';
  const groupPreview=card('自選內容預覽',Object.entries(groups??{}).map(([group,symbols])=>`<details><summary>${e(group)}・${symbols.length} 檔</summary>${symbols.map((symbol,index)=>{const stock=stockIdentity(symbol);return `<div class="toolbar">${transactionStockActions(stock.symbol,stock.name,`transfer-favorite-${group}-${index}-${stock.symbol}`,favoriteButton)}</div>`;}).join('')}</details>`).join('')||'<p class="muted">備份未包含自選資料。</p>');
  const transactionPreview=trades.map((t,i)=>{
   const stock=stockIdentity(String(t.symbol??t.stock_id??''),t.name??t.stockName??'');
   return `<article class="card">${compatible?`<label><input type="checkbox" data-compatible-index="${i}" checked>納入此筆交易</label>`:''}${transactionStockActions(stock.symbol,stock.name,`transfer-preview-${i}-${stock.symbol}`,favoriteButton)}<p>${e(t.date)} · ${e(t.type)} · 股數／入帳金額 ${e(t.shares)} · 單價 ${e(t.price)} · 幣別 ${e(t.currency||'未記錄')} · 手續費 ${e(t.fee)} · 稅 ${e(t.tax)}</p></article>`;
  }).join('');
  const dates=trades.map(t=>String(t.date??'')).filter(date=>/^\d{4}-\d{2}-\d{2}$/.test(date)).sort();
  const symbols=new Set(trades.map(t=>String(t.symbol??t.stock_id??'').trim()).filter(Boolean));
  const fileSummary=selectedFile?card('匯入檔案',`<div class="transfer-file-summary"><strong>${e(selectedFile.name)}</strong><small>${e(selectedFile.kind)}・${e(selectedFile.size)}${selectedFile.integrity?`・${e(selectedFile.integrity)}`:''}</small></div>`):'';
  const sourceCounts=compatible?.sourceRecords??{normalizedTrades:[],annualSettledRecords:[]};
  return fileSummary+card('還原預覽',`<div class="metric-grid">${metric('交易筆數',String(trades.length))}${metric('日期範圍',dates.length?`${e(dates[0])}～${e(dates.at(-1))}`:'無交易日期')}${metric('包含標的',`${symbols.size} 檔`)}${metric('券商原始明細',String(recordCount(sourceCounts.normalizedTrades)))}${metric('年度結算記錄',String(recordCount(sourceCounts.annualSettledRecords)))}${metric('自選分類',String(Object.keys(groups??{}).length))}${metric('格式',compatible?e(compatible.format):legacy?'Web v1':'Web v2')}${metric('備份日期',e((compatible??legacy??pending).createdAt??'來源未提供'))}${metric('完整性',compatible?e(compatible.integrity):legacy?'交易 checksum 已核對；自選未受保護':'完整 payload checksum 已核對')}</div><p class="muted">相同主鍵、相同內容略過；主鍵衝突整批拒絕。既有自選合併，已有偏好不被取代。券商原始明細會一併備份保存，不會重複計入持倉。</p>${legacyNotice}${compatible?compatible.warnings.map(w=>`<p class="alert">${e(w)}</p>`).join(''): ''}<button class="primary" data-transfer-merge ${merging?'disabled':''}>${merging?'正在合併':'確認合併還原'}</button><p role="status" class="${error?'alert':'muted'}">${e(error)}</p>`)+groupPreview+card('交易內容預覽',transactionPreview);
 }
 function listen(app){
  app.addEventListener('change',async event=>{
   if(event.target.id!=='rebuild-transfer-file')return;
   const file=event.target.files?.[0];if(!file||reading||merging)return;error='';pending=null;legacy=null;compatible=null;preview=null;result=null;pdfFile=null;selectedFile={name:file.name,size:`${Math.max(1,Math.round(file.size/1024))} KB`,kind:/\.pdf$/i.test(file.name)||file.type==='application/pdf'?'PDF 檔案':'備份檔案'};
   const isPDF=/\.pdf$/i.test(file.name)||file.type==='application/pdf';
   if(routeID()==='import'&&((selectedFormat==='pdf')!==isPDF)){error=selectedFormat==='pdf'?'請選擇 PDF 檔案。':'請選擇 JSON 或 .twstk 備份檔案。';await ctx.refresh();return;}
   if(isPDF){if(file.size>25*1024*1024){error='PDF 超過 25 MB';await ctx.refresh();return;}pdfFile=file;if(routeID()==='import')await ctx.refresh();else ctx.navigate('import-preview');return;}
   pdfFile=null;reading=true;
   try{await ctx.refresh();if(file.size>25*1024*1024)throw new Error('備份超過 25 MB');
    const names=ctx.state.listing?.stocks??{};
    {const text=await file.text(),value=JSON.parse(text);
     if(value.platform==='ios'||Array.isArray(value)||Array.isArray(value.transactions))compatible=await previewIOSBackup(text,{filename:file.name,names});
     else if(value.version===1){preview=await previewLegacyBackup(value);legacy=value;}else pending=await verifyBackup(value);
    }
    reading=false;selectedFile.integrity=compatible?.integrity??legacy?.integrity??(pending?.checksum?'checksum 已核對':'格式已檢查');
    if(routeID()==='import')await ctx.refresh();else ctx.navigate('import-preview');
   }catch(failure){reading=false;error=failure.name==='PasswordException'?'PDF 已加密，請先在本機解鎖後匯入。':failure.message;await ctx.refresh();}
  });
  app.addEventListener('click',async event=>{
   const format=event.target.closest('[data-transfer-format]');if(format){selectedFormat=format.dataset.transferFormat;await ctx.refresh();return;}
   const next=event.target.closest('[data-transfer-next]');if(next&&(pending||legacy||compatible||pdfFile)){ctx.navigate('import-preview');return;}
   const remove=event.target.closest('[data-transfer-remove]');if(remove){pending=null;legacy=null;compatible=null;preview=null;pdfFile=null;selectedFile=null;error='';result=null;await ctx.refresh();return;}
   const filter=event.target.closest('[data-transfer-result-filter]');if(filter){resultFilter=filter.dataset.transferResultFilter;await ctx.refresh();return;}
   const rollback=event.target.closest('[data-transfer-rollback]');if(rollback&&!merging){const hash=rollback.dataset.hash;if(!hash)return;if(!confirm('撤銷這次備份合併？系統只會移除本次新增且未被修改的交易，並復原仍符合原狀的偏好；若資料已變更，撤銷會停止並保留資料。'))return;merging=true;rollback.disabled=true;error='';try{const undone=await rollbackRestore(hash);if(result?.restoreHash===hash)result={...result,rollback:{...undone,completedAt:new Date().toISOString()}};else result=null;try{ctx.state.checkpoint=await preflight();}catch(failure){ctx.state.error='撤銷已完成，但畫面刷新失敗：'+failure.message;}await ctx.refresh();}catch(failure){merging=false;error=failure.message;await ctx.refresh();}finally{merging=false;}return;}
   const parseButton=event.target.closest('[data-transfer-read-pdf]');
   if(parseButton&&!reading&&!merging&&pdfFile){reading=true;error='';parseButton.disabled=true;parseButton.textContent='本機解析中…';try{const password=app.querySelector('#rebuild-pdf-password')?.value??'',names=ctx.state.listing?.stocks??{};compatible=await previewCooperativePDF(await extractPDFText(pdfFile,{password}),{names});pdfFile=null;reading=false;ctx.navigate('import-preview');}catch(failure){reading=false;error=failure.name==='PasswordException'?'PDF 密碼錯誤或檔案無法解鎖。':failure.message;await ctx.refresh();}return;}
   const button=event.target.closest('[data-transfer-merge]');if(!button||merging)return;
   const include=app.querySelector('#rebuild-legacy-favorites')?.checked===true;
   merging=true;button.disabled=true;error='';
   try{const selectedIDs=compatible?[...app.querySelectorAll('[data-compatible-index]:checked')].map(input=>compatible.trades[Number(input.dataset.compatibleIndex)].id):null;
    const payload=compatible?await convertCompatiblePreview(compatible,{selectedIDs}):legacy?await convertLegacyBackup(legacy,{includeUnverifiedFavorites:include}):pending;
    if(!payload)throw new Error('預覽已失效，請重新選擇備份');const before=await readTrades(),previous=new Set(before.map(row=>JSON.stringify([typeof row.id,typeof row.id==='string'?row.id.toLowerCase():row.id])));const merged=await mergeBackup(payload);const entries=payload.trades.map(trade=>({trade,status:previous.has(JSON.stringify([typeof trade.id,typeof trade.id==='string'?trade.id.toLowerCase():trade.id]))?'skipped':'added'}));result={...merged,entries,completedAt:new Date().toISOString()};resultFilter='all';pending=null;legacy=null;compatible=null;preview=null;
    try{ctx.state.checkpoint=await preflight();}catch(failure){ctx.state.error='還原已完成，但畫面刷新失敗：'+failure.message;}
    ctx.navigate('import-result');
   }catch(failure){merging=false;error=failure.message;await ctx.refresh();}finally{merging=false;button.disabled=false;}
  });
 }
 return {handles,page,listen};
}
