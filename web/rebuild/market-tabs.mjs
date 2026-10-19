const tabs=[['overview','市場總覽'],['heatmap','市場熱力圖'],['rankings','行情排行']];

export function marketTabs(active){
 return `<nav class="market-tabs" aria-label="M01 市場頁面">${tabs.map(([id,label])=>`<a href="#/${id}"${active===id?' aria-current="page"':''}>${label}</a>`).join('')}</nav>`;
}
