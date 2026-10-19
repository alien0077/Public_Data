const icons=Object.freeze({
 market:'<svg viewBox="0 0 24 24" focusable="false"><path d="M3 20V4M3 20h18M6 16l4-5 3 2 6-7"/><path d="M15 6h4v4"/></svg>',
 watchlist:'<svg viewBox="0 0 24 24" focusable="false"><path class="icon-fill" d="m12 2.8 2.8 5.7 6.3.9-4.55 4.43 1.08 6.27L12 17.14l-5.63 2.96 1.08-6.27L2.9 9.4l6.3-.92L12 2.8Z"/></svg>',
 explore:'<svg viewBox="0 0 24 24" focusable="false"><circle cx="12" cy="12" r="9.2"/><path class="icon-fill" d="m15.8 8.2-2.25 5.35-5.35 2.25 2.25-5.35 5.35-2.25Z"/></svg>',
 assets:'<svg viewBox="0 0 24 24" focusable="false"><path class="icon-fill" d="M12 2.8v9.2l7.95 4.6A9.2 9.2 0 0 0 12 2.8Z"/><path d="M12 2.8a9.2 9.2 0 1 0 7.95 13.8L12 12V2.8Z"/></svg>',
 more:'<svg viewBox="0 0 24 24" focusable="false"><circle cx="12" cy="12" r="9.2"/><circle class="icon-fill" cx="7.5" cy="12" r="1"/><circle class="icon-fill" cx="12" cy="12" r="1"/><circle class="icon-fill" cx="16.5" cy="12" r="1"/></svg>'
});
const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export function bottomNavMarkup(tabs,activeTab){
 if(!Array.isArray(tabs)||tabs.length!==5)throw new Error('Primary navigation requires exactly five tabs');
 return `<nav class="bottom-nav" aria-label="主要分頁">${tabs.map(tab=>{
  if(!Object.hasOwn(icons,tab.id))throw new Error(`Unknown primary navigation icon: ${tab.id}`);
  return `<a href="#/${escapeHTML(tab.root)}" ${tab.id===activeTab?'aria-current="page"':''}><span class="nav-icon" aria-hidden="true">${icons[tab.id]}</span><span>${escapeHTML(tab.title)}</span></a>`;
 }).join('')}</nav>`;
}
