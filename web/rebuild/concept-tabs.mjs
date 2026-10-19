// M20 is a settings directory and M21 is a transfer flow; both use pushed
// detail pages with back navigation, not peer pages in a segmented bar.
const excludedConcepts=new Set(['M01','M20','M21','M23','M24','M25']);
const excludedRoutes=new Set(['rotation-history','strategy']);

function escapeHTML(value){
 return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}

export function conceptTabs(routes,activeId,{symbol=null}={}){
 const active=routes.find(route=>route.id===activeId);
 if(excludedRoutes.has(activeId))return '';
 const concept=active?.concept;
 if(!/^M\d{2}$/.test(concept??'')||excludedConcepts.has(concept))return '';
 const pages=routes.filter(route=>!excludedRoutes.has(route.id)&&route.concept===concept&&route.mobilePlatforms?.includes('web'));
 if(pages.length<2)return '';
 const links=pages.map(route=>{
  const query=symbol?`?symbol=${encodeURIComponent(symbol)}`:'';
  const current=route.id===activeId?' aria-current="page"':'';
  return `<a href="#/${encodeURIComponent(route.id)}${query}"${current}><span class="concept-tab-label">${escapeHTML(route.title)}</span></a>`;
 }).join('');
 return `<nav class="concept-tabs" data-count="${pages.length}" aria-label="${escapeHTML(concept)} 頁面切換">${links}</nav>`;
}
