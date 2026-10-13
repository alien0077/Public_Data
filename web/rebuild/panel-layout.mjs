// Shared desktop panel sizing. Mobile remains a single document scroll surface.
const layouts=[
 ['desktop-market','市場工作台',['市場觀察','熱力圖'],[60,40]],
 ['desktop-explore','探索工作台',['篩選條件','結果清單','策略研究'],[22,43,35]],
 ['desktop-assets','資產工作台',['持股分析','交易紀錄'],[64,36]],
 ['desktop-settings','設定工作台',['設定導覽','資料管理'],[20,80]],
 ['desktop-etf','ETF 工作台',['配置','成分清單','來源比較'],[26,44,30]],
];
export function mountPanelLayout(root){
 const page=root.querySelector('.desktop-page'),spec=layouts.find(([name])=>page?.classList.contains(name));
 if(!page||!spec)return()=>{};
 const [context,title,labels,defaults]=spec,key=`rebuild.panels.v1.${context}`,controller=new AbortController(),media=matchMedia('(min-width:1100px)');
 let widths=[...defaults],drag=null;
 try{const saved=JSON.parse(localStorage.getItem(key));if(saved?.version===1&&Array.isArray(saved.widths)&&saved.widths.length===defaults.length&&saved.widths.every(v=>Number.isFinite(v)&&v>=15&&v<=85)&&Math.abs(saved.widths.reduce((a,b)=>a+b,0)-100)<.01)widths=saved.widths;}catch{}
 const controls=document.createElement('section');controls.className='card desktop-panel-controls';controls.setAttribute('aria-label',title+'版面');
 const header=document.createElement('div');header.className='toolbar';const heading=document.createElement('strong');heading.textContent=title+'版面';header.append(heading);
 const reset=document.createElement('button');reset.textContent='重設面板寬度';header.append(reset);controls.append(header);
 const feedback=document.createElement('p');feedback.className='muted';feedback.setAttribute('role','status');
 const handles=[],inputs=[];
 for(let i=0;i<widths.length-1;i++){
  const label=document.createElement('label');label.textContent=labels[i]+'寬度';const input=document.createElement('input');input.type='range';input.min='15';input.step='1';input.setAttribute('aria-label',labels[i]+'寬度百分比');label.append(input);controls.append(label);inputs.push(input);
  const handle=document.createElement('div');handle.className='desktop-panel-divider';handle.tabIndex=0;handle.setAttribute('role','separator');handle.setAttribute('aria-orientation','vertical');handle.setAttribute('aria-label',`調整${labels[i]}與${labels[i+1]}寬度`);page.append(handle);handles.push(handle);
  input.addEventListener('input',()=>{resize(i,Number(input.value));save();},{signal:controller.signal});
  handle.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();resize(i,event.key==='Home'?15:event.key==='End'?widths[i]+widths[i+1]-15:widths[i]+(event.key==='ArrowLeft'?-2:2));save();},{signal:controller.signal});
  handle.addEventListener('pointerdown',event=>{event.preventDefault();handle.setPointerCapture(event.pointerId);drag={i,x:event.clientX,value:widths[i],width:page.getBoundingClientRect().width};},{signal:controller.signal});
  handle.addEventListener('pointermove',event=>{if(!drag||drag.i!==i||!handle.hasPointerCapture(event.pointerId))return;resize(i,drag.value+(event.clientX-drag.x)/Math.max(1,drag.width)*100);},{signal:controller.signal});
  const finish=event=>{if(handle.hasPointerCapture(event.pointerId))handle.releasePointerCapture(event.pointerId);if(drag){drag=null;save();}};
  handle.addEventListener('pointerup',finish,{signal:controller.signal});handle.addEventListener('pointercancel',finish,{signal:controller.signal});
 }
 controls.append(feedback);page.before(controls);
 function resize(index,value){const total=widths[index]+widths[index+1];widths[index]=Math.min(total-15,Math.max(15,value));widths[index+1]=total-widths[index];apply();}
 function save(){try{localStorage.setItem(key,JSON.stringify({version:1,widths}));feedback.textContent='版面已保存，下次開啟自動套用。';}catch{feedback.textContent='目前瀏覽器無法保存偏好；本次版面仍可使用。';}}
 function apply(){
  if(media.matches)page.style.gridTemplateColumns=widths.map(w=>`minmax(0,${w}fr)`).join(' ');else page.style.removeProperty('grid-template-columns');
  let offset=0;handles.forEach((handle,i)=>{offset+=widths[i];handle.style.left=`calc(${offset}% - 6px)`;handle.setAttribute('aria-valuemin','15');handle.setAttribute('aria-valuemax',String(Math.round(widths[i]+widths[i+1]-15)));handle.setAttribute('aria-valuenow',String(Math.round(widths[i])));handle.setAttribute('aria-valuetext',`${labels[i]} ${Math.round(widths[i])}%`);inputs[i].max=handle.getAttribute('aria-valuemax');inputs[i].value=String(widths[i]);});
 }
 reset.addEventListener('click',()=>{widths=[...defaults];apply();save();},{signal:controller.signal});
 media.addEventListener('change',apply,{signal:controller.signal});apply();
 feedback.textContent='拖曳分隔線，或使用滑桿與方向鍵調整；偏好依工作台分別保存。';
 return()=>{controller.abort();controls.remove();handles.forEach(h=>h.remove());page.style.removeProperty('grid-template-columns');};
}
