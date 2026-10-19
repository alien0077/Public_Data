function escapeHTML(value){
 return String(value??'').replace(/[&<>"\']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}

export function desktopSecurityUnavailableContent({name,symbol}){
 const safeName=escapeHTML(name),safeSymbol=escapeHTML(symbol),query=`?symbol=${encodeURIComponent(symbol)}`;
 const periods=['日線','週線','月線','1分','5分','15分','30分','60分'].map(label=>`<button type="button" disabled aria-disabled="true">${label}</button>`).join('');
 const plot=`<svg viewBox="0 0 720 220" role="img" aria-label="${safeName} ${safeSymbol} 行情圖表資料不足">${[32,76,120,164,208].map(y=>`<line class="grid" x1="52" x2="710" y1="${y}" y2="${y}"/>`).join('')}</svg><p role="status">上市資格尚未確認，暫停載入行情圖表；沒有繪製推測線段。</p>`;
 const lower=[['company','財務'],['flows','籌碼'],['news','事件'],['records','我的紀錄']].map(([route,label])=>`<a href="#/${route}${query}">${label}</a>`).join('');
 return `<section class="desktop-security-unavailable" aria-label="${safeName} ${safeSymbol} 個股工作區">
  <section class="card desktop-security-unavailable-chart"><h2>${safeName} ${safeSymbol}・行情圖表</h2><div class="toolbar" role="group" aria-label="圖表週期">${periods}</div><div class="desktop-security-empty-plot">${plot}</div><div class="desktop-security-unavailable-series"><section><h3>成交量</h3><p role="status">資料不足・行情資格未確認</p></section><section><h3>MACD</h3><p role="status">資料不足・不以未驗證行情計算指標</p></section></div></section>
  <section class="desktop-security-unavailable-fundamentals"><nav aria-label="財務籌碼事件與個人紀錄">${lower}</nav><div class="desktop-security-unavailable-panels"><section class="card"><h3>營收與獲利表現</h3><p role="status">Public_Data 歷史欄位待確認可用；目前未載入分析資料。</p></section><section class="card"><h3>獲利能力</h3><p role="status">資料不足・不以範例值填入。</p></section></div></section>
 </section>`;
}
