export function mountWorkspaceKeys(app,inspect){
 app.addEventListener('keydown',event=>{
  if(!matchMedia('(min-width:1100px)').matches||!['ArrowUp','ArrowDown','Home','End'].includes(event.key))return;
  const row=event.target.closest('tr[data-row-stock]');if(!row||event.target!==row)return;
  const rows=[...row.closest('tbody').querySelectorAll('tr[data-row-stock]')],current=rows.indexOf(row);
  const index=event.key==='Home'?0:event.key==='End'?rows.length-1:Math.min(rows.length-1,Math.max(0,current+(event.key==='ArrowDown'?1:-1)));
  const next=rows[index];if(!next)return;event.preventDefault();next.focus();inspect(next.dataset.rowStock);
 });
}

export function markWorkspaceSelection(app,symbol){
 for(const row of app.querySelectorAll('tr[data-row-stock]'))row.setAttribute('aria-selected',String(row.dataset.rowStock===symbol));
}
