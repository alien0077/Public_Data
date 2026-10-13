import {escapeHTML as e,number} from './core.mjs';
const stableTextCompare=(a,b)=>{const left=Array.from(String(a),c=>c.codePointAt(0)),right=Array.from(String(b),c=>c.codePointAt(0));for(let i=0;i<Math.min(left.length,right.length);i++)if(left[i]!==right[i])return left[i]-right[i];return left.length-right.length;};
// Preserve the native heatmap's descending-weight binary split and >40% leader.
export function heatmapLayout(rows,width,height,weightOf=row=>row.turnover){
 if(!(width>0&&height>0&&Number.isFinite(width)&&Number.isFinite(height)))return [];
 const sorted=rows.filter(r=>Number.isFinite(weightOf(r))&&weightOf(r)>0&&Number.isFinite(r.changePercent)).slice().sort((a,b)=>weightOf(b)-weightOf(a)||stableTextCompare(a.symbol,b.symbol));
 if(!sorted.length)return [];
 // Normalize to avoid overflow while keeping the same proportions.
 const max=weightOf(sorted[0]),weight=r=>weightOf(r)/max,total=sorted.reduce((n,r)=>n+weight(r),0),result=[];
 function split(rect,ratio,wide){return wide?[{...rect,width:rect.width*ratio},{...rect,x:rect.x+rect.width*ratio,width:rect.width*(1-ratio)}]:[{...rect,height:rect.height*ratio},{...rect,y:rect.y+rect.height*ratio,height:rect.height*(1-ratio)}];}
 function visit(items,rect,sum){
  if(!items.length)return;
  if(items.length===1){result.push({row:items[0],...rect});return;}
  let partial=0,best=Infinity,index=0;
  for(let i=0;i<items.length;i++){partial+=weight(items[i]);const difference=Math.abs(partial-sum/2);if(difference<best){best=difference;index=i;}else break;}
  index=Math.min(index,items.length-2);
  const left=items.slice(0,index+1),leftSum=left.reduce((n,r)=>n+weight(r),0),[a,b]=split(rect,leftSum/sum,rect.width>=rect.height);
  visit(left,a,leftSum);visit(items.slice(index+1),b,sum-leftSum);
 }
 const rect={x:0,y:0,width,height},ratio=weight(sorted[0])/total;
 if(ratio>.4){const [a,b]=split(rect,ratio,width>height);result.push({row:sorted[0],...a});visit(sorted.slice(1),b,total-weight(sorted[0]));}
 else visit(sorted,rect,total);
 return result;
}
export function heatmapGroups(rows){
 const universe=rows.filter(r=>r.securityType!=='fund'&&r.sector!=='ETF'&&r.industry!=='ETF'&&Number.isFinite(r.turnover)&&r.turnover>0&&Number.isFinite(r.changePercent))
  .slice().sort((a,b)=>b.turnover-a.turnover||stableTextCompare(a.symbol,b.symbol)).slice(0,150),groups=new Map();
 for(const row of universe){
  const sector=String(row.industry||row.sector||'').trim()||'分類資料不足';if(!groups.has(sector))groups.set(sector,[]);groups.get(sector).push(row);
 }
 return [...groups].map(([name,members])=>({symbol:`sector:${name}`,name,changePercent:0,turnover:members.reduce((sum,r)=>sum+r.turnover,0),rows:members.slice().sort((a,b)=>b.turnover-a.turnover||stableTextCompare(a.symbol,b.symbol)),memberCount:members.length}))
  .filter(group=>Number.isFinite(group.turnover)&&group.turnover>0).sort((a,b)=>b.turnover-a.turnover||stableTextCompare(a.name,b.name));
}
export function mountHeatmap(host,rows){
 const groups=heatmapGroups(rows);let selected='';try{selected=localStorage.getItem('rebuild.heatmap.sector.v1')||'';}catch{}
 host.innerHTML=`<label class="heatmap-filter">產業篩選<select aria-label="熱力圖產業篩選"><option value="">全部產業</option>${groups.map(g=>`<option value="${e(g.name)}">${e(g.name)}（${g.memberCount}）</option>`).join('')}</select></label><div data-heatmap-canvas role="group" aria-label="按產業分組的成交值熱力圖"></div><div class="heatmap-legend" style="display:flex;align-items:center;justify-content:center;gap:8px;padding:8px"><span>跌</span><i class="heatmap-down" aria-hidden="true"></i><i class="heatmap-flat" aria-hidden="true"></i><i class="heatmap-up" aria-hidden="true"></i><span>漲・紅漲綠跌</span><small>區塊面積依成交值</small></div>`;
 const select=host.querySelector('select'),canvas=host.querySelector('[data-heatmap-canvas]');
 if(groups.some(g=>g.name===selected))select.value=selected;else selected='';
 select.addEventListener('change',()=>{selected=select.value;try{localStorage.setItem('rebuild.heatmap.sector.v1',selected);}catch{}draw();});
 function draw(){
  const width=canvas.clientWidth,height=460,selectedGroup=groups.find(g=>g.name===selected),outer=selectedGroup?[{row:selectedGroup,x:0,y:0,width,height}]:heatmapLayout(groups,width,height,g=>g.turnover);
  canvas.style.cssText=`position:relative;height:${height}px;overflow:hidden;border-radius:12px;background:var(--card)`;
  const nodes=(group,x,y,w,h)=>{
   const rects=heatmapLayout(group.rows,w,Math.max(0,h-19));
   const header=`<span style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:18px;box-sizing:border-box;padding:1px 4px;background:var(--line);color:var(--ink);border:1px solid var(--card);overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:11px;font-weight:700">${e(group.name)}・${group.memberCount} 檔・成交值前150</span>`;
   return header+rects.map(({row,x:rx,y:ry,width:rw,height:rh})=>tile(row,x+rx,y+ry+19,rw,rh));
  };
  canvas.innerHTML=outer.map(({row,x,y,width:w,height:h})=>nodes(row,x,y,w,h)).join('');
 }
 function tile(row,x,y,width,height){
   const name=row.name||row.symbol,label=`${name} ${row.symbol} ${row.changePercent>0?'+':''}${number(row.changePercent)}%`;
   const color=row.changePercent>0?'var(--heatmap-up)':row.changePercent<0?'var(--heatmap-down)':'var(--heatmap-flat)';
   return `<a href="#/security?symbol=${encodeURIComponent(row.symbol)}" aria-label="${e(label)}" title="${e(label)}" style="position:absolute;left:${x}px;top:${y}px;width:${Math.max(0,width-1)}px;height:${Math.max(0,height-1)}px;background:${color};color:var(--heatmap-text);overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;text-decoration:none;font-size:12px;line-height:1.3">${width>58&&height>45?`<strong style="max-width:100%;overflow:hidden">${e(name)}</strong><span>${e(row.symbol)}</span>${height>65?`<span>${row.changePercent>0?'+':''}${number(row.changePercent)}%</span>`:''}`:''}</a>`;
 }
 draw();const observer=new ResizeObserver(draw);observer.observe(host);return()=>observer.disconnect();
}
