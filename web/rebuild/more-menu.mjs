const entries=[
 ['appearance','外觀與顯示','主題、字體大小、數字格式與圖表偏好','◐'],
 ['sync','資料同步','同步市場行情、基本資料與最近 Raw 資料','⇩'],
 ['backup','備份與還原','建立備份、匯入資料與預覽還原內容','▤'],
 ['fx','匯率','查看 Public_Data 匯率與幣別換算','＄'],
 ['tools','工具','計算機、除權息與股利試算','⚒'],
 ['about','關於','版本、資料來源與隱私說明','ⓘ']
];

function escapeHTML(value){
 return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}

export function moreMenuMarkup(routes){
 const available=new Set(routes.map(route=>route.id));
 return entries.map(([id,label,detail,icon])=>{
  if(!available.has(id))throw new Error(`M20 menu route is missing: ${id}`);
  return `<section class="card more-menu-card"><a class="more-menu-link" href="#/${id}" aria-label="${escapeHTML(label)}，${escapeHTML(detail)}"><span class="more-menu-icon" aria-hidden="true">${icon}</span><span class="more-menu-copy"><strong>${escapeHTML(label)}</strong><small>${escapeHTML(detail)}</small></span><span class="more-menu-chevron" aria-hidden="true">›</span></a></section>`;
 }).join('');
}

export const moreMenuRouteIDs=Object.freeze(entries.map(([id])=>id));
