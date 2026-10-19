const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export function transactionStockActions(symbol,name,identifier,favoriteButton){
 const code=String(symbol??'').trim();
 if(!code)return '';
 const label=String(name??'').trim()||code;
 const detailLabel=`查看個股：${label} ${code}`;
 return `<div class="toolbar"><a href="#/security?symbol=${encodeURIComponent(code)}" aria-label="${escapeHTML(detailLabel)}">${escapeHTML(detailLabel)}</a>${favoriteButton(code,label,identifier)}</div>`;
}
