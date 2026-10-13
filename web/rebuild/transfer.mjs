import {escapeHTML as e,identity} from './core.mjs';
import {preflight,verifyBackup,mergeBackup,previewLegacyBackup,convertLegacyBackup} from './storage.mjs';

import {previewIOSBackup,convertCompatiblePreview,extractPDFText,previewCooperativePDF} from './import-compat.mjs';

export function createTransferModule(ctx){
 let pending=null,legacy=null,compatible=null,preview=null,result=null,error='',merging=false,reading=false,pdfFile=null;
 const handles=id=>['backup','import','restore','import-preview','import-result'].includes(id);
 const stockIdentity=(symbol,savedName='')=>{const code=String(symbol??'').trim()||'資料不足';return identity(code,ctx.state.rows.find(row=>row.symbol===code),ctx.state.checkpoint?.learnedStocks?.[code],{name:savedName},ctx.state.listing?.stocks?.[code]);};
 function page(id){
  const {card,metric,status,link}=ctx;
  if(['backup','import'].includes(id))return card('備份與匯出',`<button class="primary" data-action="backup">建立並匯出完整備份</button><label>選擇備份或合庫 PDF<input id="rebuild-transfer-file" type="file" accept=".json,.twstk,.pdf,application/json,application/pdf" ${reading?'disabled':''}></label><p class="muted">支援 Web v2 完整備份及 Web v1 舊備份。讀取後先預覽，確認才合併；原有紀錄保留。也支援 iOS .twstk／交易 JSON 與具完整表頭的合庫文字 PDF；跨格式只匯入交易。</p><p role="status" class="${error?'alert':'muted'}">${e(reading?'正在本機解析檔案…':error)}</p>`);
  if(id==='import-preview'&&pdfFile&&!compatible)return card('合庫證券 PDF',`<p>${e(pdfFile.name)}</p><label>PDF 密碼（若有）<input id="rebuild-pdf-password" type="password" autocomplete="off" aria-label="PDF 密碼（若有）" ${reading?'disabled':''}></label><button type="button" class="primary" data-transfer-read-pdf ${reading?'disabled':''}>${reading?'本機解析中…':'解析並預覽'}</button><p role="status" class="${error?'alert':'muted'}">${e(error)}</p><p class="muted">密碼只用於本次本機解鎖，不保存至偏好或備份。</p>`);
  if(id==='import-result')return result?card('還原結果',`<div class="metric-grid">${metric('新增交易',String(result.added))}${metric('略過相同紀錄',String(result.skipped))}</div><p class="source muted">來源 checkpoint：${e(result.beforeHash)}</p><p>合併已完成，原有紀錄保留。</p>`)+card('',link('transactions')):status('尚未執行還原','先選擇並確認備份。')+card('',link('import'));
  if(!pending&&!legacy&&!compatible)return status('尚未選擇備份','請先選擇 Web 備份檔案。')+card('',link('import'));
  const trades=compatible?.trades??legacy?.trades??pending.trades,groups=compatible?.favorites??legacy?.favorites??pending.favorites;
  const legacyNotice=legacy?`<p class="alert">${e(preview.warning)}</p><label class="toolbar"><input type="checkbox" id="rebuild-legacy-favorites" style="width:auto">我已核對下方自選內容，同意納入沒有 checksum 保護的自選資料</label>`:'';
  const groupPreview=card('自選內容預覽',Object.entries(groups??{}).map(([group,symbols])=>`<details><summary>${e(group)}・${symbols.length} 檔</summary>${symbols.map(symbol=>{const stock=stockIdentity(symbol);return `<p>${e(stock.name)} ${e(stock.symbol)}</p>`;}).join('')}</details>`).join('')||'<p class="muted">備份未包含自選資料。</p>');
  const transactionPreview=trades.map((t,i)=>{
   const stock=stockIdentity(String(t.symbol??t.stock_id??''),t.name??t.stockName??'');
   return `<article class="card">${compatible?`<label><input type="checkbox" data-compatible-index="${i}" checked>納入此筆交易</label>`:''}<strong>${e(stock.name)} ${e(stock.symbol)}</strong><p>${e(t.date)} · ${e(t.type)} · 股數／入帳金額 ${e(t.shares)} · 單價 ${e(t.price)} · 手續費 ${e(t.fee)} · 稅 ${e(t.tax)}</p></article>`;
  }).join('');
  return card('還原預覽',`<div class="metric-grid">${metric('交易筆數',String(trades.length))}${metric('格式',compatible?e(compatible.format):legacy?'Web v1':'Web v2')}${metric('備份日期',e((compatible??legacy??pending).createdAt??'來源未提供'))}${metric('完整性',compatible?e(compatible.integrity):legacy?'交易 checksum 已核對；自選未受保護':'完整 payload checksum 已核對')}</div><p class="muted">相同主鍵、相同內容略過；主鍵衝突整批拒絕。既有自選合併，已有偏好不被取代。</p>${legacyNotice}${compatible?compatible.warnings.map(w=>`<p class="alert">${e(w)}</p>`).join(''): ''}<button class="primary" data-transfer-merge ${merging?'disabled':''}>${merging?'正在合併':'確認合併還原'}</button><p role="status" class="${error?'alert':'muted'}">${e(error)}</p>`)+groupPreview+card('交易內容預覽',transactionPreview);
 }
 function listen(app){
  app.addEventListener('change',async event=>{
   if(event.target.id!=='rebuild-transfer-file')return;
   const file=event.target.files?.[0];if(!file||reading||merging)return;error='';pending=null;legacy=null;compatible=null;preview=null;result=null;pdfFile=null;
   if(/\.pdf$/i.test(file.name)||file.type==='application/pdf'){if(file.size>25*1024*1024){error='PDF 超過 25 MB';await ctx.refresh();return;}pdfFile=file;ctx.navigate('import-preview');return;}
   pdfFile=null;reading=true;
   try{await ctx.refresh();if(file.size>25*1024*1024)throw new Error('備份超過 25 MB');
    const names=ctx.state.listing?.stocks??{};
    {const text=await file.text(),value=JSON.parse(text);
     if(value.platform==='ios'||Array.isArray(value)||Array.isArray(value.transactions))compatible=await previewIOSBackup(text,{filename:file.name,names});
     else if(value.version===1){preview=await previewLegacyBackup(value);legacy=value;}else pending=await verifyBackup(value);
    }
    reading=false;
    ctx.navigate('import-preview');
   }catch(failure){reading=false;error=failure.name==='PasswordException'?'PDF 已加密，請先在本機解鎖後匯入。':failure.message;await ctx.refresh();}
  });
  app.addEventListener('click',async event=>{
   const parseButton=event.target.closest('[data-transfer-read-pdf]');
   if(parseButton&&!reading&&!merging&&pdfFile){reading=true;error='';parseButton.disabled=true;parseButton.textContent='本機解析中…';try{const password=app.querySelector('#rebuild-pdf-password')?.value??'',names=ctx.state.listing?.stocks??{};compatible=await previewCooperativePDF(await extractPDFText(pdfFile,{password}),{names});pdfFile=null;reading=false;ctx.navigate('import-preview');}catch(failure){reading=false;error=failure.name==='PasswordException'?'PDF 密碼錯誤或檔案無法解鎖。':failure.message;await ctx.refresh();}return;}
   const button=event.target.closest('[data-transfer-merge]');if(!button||merging)return;
   const include=app.querySelector('#rebuild-legacy-favorites')?.checked===true;
   merging=true;button.disabled=true;error='';
   try{const selectedIDs=compatible?[...app.querySelectorAll('[data-compatible-index]:checked')].map(input=>compatible.trades[Number(input.dataset.compatibleIndex)].id):null;
    const payload=compatible?await convertCompatiblePreview(compatible,{selectedIDs}):legacy?await convertLegacyBackup(legacy,{includeUnverifiedFavorites:include}):pending;
    if(!payload)throw new Error('預覽已失效，請重新選擇備份');result=await mergeBackup(payload);pending=null;legacy=null;compatible=null;preview=null;
    try{ctx.state.checkpoint=await preflight();}catch(failure){ctx.state.error='還原已完成，但畫面刷新失敗：'+failure.message;}
    ctx.navigate('import-result');
   }catch(failure){merging=false;error=failure.message;await ctx.refresh();}finally{merging=false;button.disabled=false;}
  });
 }
 return {handles,page,listen};
}
