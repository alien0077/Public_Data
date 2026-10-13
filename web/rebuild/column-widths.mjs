import {escapeHTML as e} from './core.mjs';
const key=context=>`rebuild.columns.v1.${context}`;
const minimum=field=>field==='identity'?180:90;
const normal=field=>field==='identity'?220:140;
function read(context){try{const value=JSON.parse(localStorage.getItem(key(context)));return value?.version===1&&value.widths&&typeof value.widths==='object'?value.widths:{};}catch{return {};}}
export function columnWidth(context,field){const value=read(context)[field];return Number.isFinite(value)?Math.min(500,Math.max(minimum(field),value)):normal(field);}
export function columnHandle(context,field,label){return `<span class="column-resize" role="separator" tabindex="0" aria-orientation="vertical" aria-label="調整${e(label)}欄寬" aria-valuemin="${minimum(field)}" aria-valuemax="500" aria-valuenow="${columnWidth(context,field)}" data-column-resize="${e(field)}" data-column-context="${e(context)}"></span>`;}
export function mountColumnWidths(root){
 let drag=null;
 const tables=context=>[...root.querySelectorAll('table[data-width-context]')].filter(t=>t.dataset.widthContext===context);
 function apply(context,field,width){
  for(const table of tables(context)){
   const col=[...table.querySelectorAll('col[data-width-field]')].find(c=>c.dataset.widthField===field);if(col)col.style.width=width+'px';
   const widths=[...table.querySelectorAll('col')].map(c=>parseFloat(c.style.width)||72);table.style.width=widths.reduce((a,b)=>a+b,0)+'px';
   const handle=[...table.querySelectorAll('[data-column-resize]')].find(h=>h.dataset.columnResize===field);handle?.setAttribute('aria-valuenow',String(Math.round(width)));
  }
 }
 function save(context,field,width){
  const widths=read(context);widths[field]=width;
  try{localStorage.setItem(key(context),JSON.stringify({version:1,widths}));announce(context,'欄寬已保存。');}catch{announce(context,'瀏覽器無法保存欄寬；本次調整仍有效。');}
 }
 function announce(context,message){for(const table of tables(context)){const output=table.closest('.stock-table')?.querySelector('[data-width-status]');if(output)output.textContent=message;}}
 root.addEventListener('pointerdown',event=>{
  const handle=event.target.closest('[data-column-resize]');if(!handle)return;
  event.preventDefault();event.stopPropagation();handle.setPointerCapture(event.pointerId);
  drag={handle,context:handle.dataset.columnContext,field:handle.dataset.columnResize,x:event.clientX,width:Number(handle.getAttribute('aria-valuenow')),current:Number(handle.getAttribute('aria-valuenow'))};
 },true);
 root.addEventListener('pointermove',event=>{if(!drag||!drag.handle.hasPointerCapture(event.pointerId))return;event.preventDefault();drag.current=Math.min(500,Math.max(minimum(drag.field),drag.width+event.clientX-drag.x));apply(drag.context,drag.field,drag.current);},true);
 const finish=event=>{if(!drag)return;if(drag.handle.hasPointerCapture(event.pointerId))drag.handle.releasePointerCapture(event.pointerId);save(drag.context,drag.field,drag.current);drag=null;};
 root.addEventListener('pointerup',finish,true);root.addEventListener('pointercancel',finish,true);
 root.addEventListener('dragstart',event=>{if(drag||event.target.closest('[data-column-resize]')){event.preventDefault();event.stopPropagation();}},true);
 root.addEventListener('keydown',event=>{
  const handle=event.target.closest('[data-column-resize]');if(!handle||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  event.preventDefault();event.stopPropagation();const field=handle.dataset.columnResize,context=handle.dataset.columnContext;
  const width=event.key==='Home'?minimum(field):event.key==='End'?500:Math.min(500,Math.max(minimum(field),Number(handle.getAttribute('aria-valuenow'))+(event.key==='ArrowLeft'?-10:10)));
  apply(context,field,width);save(context,field,width);
 },true);
 root.addEventListener('click',event=>{
  if(event.target.closest('[data-column-resize]')){event.preventDefault();event.stopPropagation();return;}
  const button=event.target.closest('[data-column-reset]');if(!button)return;event.preventDefault();event.stopPropagation();const context=button.dataset.columnReset;
  const fields=new Set(tables(context).flatMap(t=>[...t.querySelectorAll('col[data-width-field]')].map(c=>c.dataset.widthField)));
  for(const field of fields)apply(context,field,normal(field));
  try{localStorage.setItem(key(context),JSON.stringify({version:1,widths:{}}));announce(context,'已恢復預設欄寬。');}catch{announce(context,'本次已恢復預設；偏好無法保存。');}
 },true);
}
