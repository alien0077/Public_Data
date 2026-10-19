import {taipeiDay} from './core.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {rotationGroups,createRotationPage} from './rotation.mjs';
test('actual turnover shares, partial coverage and institutional lot conversion',()=>{
 const rows=[{sector:' 半導體 ',turnover:3e8,price:100,foreignNet:100,trustNet:20,dealerNet:-10},{sector:'半導體',turnover:null,price:200,foreignNet:0,trustNet:null,dealerNet:0},{sector:'金融',turnover:1e8,price:10,foreignNet:-200,trustNet:0,dealerNet:0},{sector:' ',turnover:null,volume:1e9,price:999}];
 const result=rotationGroups(rows);assert.deepEqual(result.map(g=>g.name),['半導體','金融','分類資料不足']);
 assert.equal(result[0].share,75);assert.equal(result[0].turnoverCount,1);assert.equal(result[0].flowCount,1);assert.equal(result[0].count,2);assert.equal(result[0].flow,0.11);assert.equal(result[1].flow,-0.02);
 assert.equal(result[2].turnover,null);assert.equal(result[2].flow,null);assert.equal(result[2].share,null);assert.equal(result[0].rows[0],rows[0]);
});
test('zeros are observed values; missing, numeric strings and negative turnover excluded',()=>{
 const result=rotationGroups([{sector:'zero',turnover:0,price:10,foreignNet:0,trustNet:0,dealerNet:0},{sector:'bad',turnover:-1,price:0,foreignNet:1,trustNet:1,dealerNet:1},{sector:'bad',turnover:'10',price:10,foreignNet:1,trustNet:1,dealerNet:NaN},{sector:'bad',turnover:Infinity,price:Infinity,foreignNet:1,trustNet:1,dealerNet:1}]);
 assert.equal(result[0].name,'zero');assert.equal(result[0].turnover,0);assert.equal(result[0].flow,0);assert.equal(result[0].share,null);assert.equal(result[1].turnover,null);assert.equal(result[1].flow,null);assert.equal(result[1].flowCount,0);
});
test('adjusted fields and synthetic volume prices never supply missing raw facts',()=>{
 const result=rotationGroups([{sector:'x',pct:10,adj_c:99,volume:100,price:10,foreignNet:1,trustNet:1}]);
 assert.equal(result[0].turnover,null);assert.equal(result[0].flow,null);assert.deepEqual(rotationGroups([]),[]);
 assert.equal(rotationGroups([{sector:'__proto__',turnover:10}])[0].name,'__proto__');
});
test('render escapes source classification, keeps sector overview compact and refreshes selection',async()=>{
 const rows=[{sector:'<script>x</script>',symbol:'2330',name:'台積電',turnover:1e8}];let refreshed=0,listeners=[];
 const page=createRotationPage({state:{rows,index:{latest_daily_tw:'2026-10-08'},listing:{cutoff:taipeiDay(),validThrough:taipeiDay(),stocks:{2330:{status:'LISTED',eligible:true}}}},card:(name,body)=>body,metric:(name,value)=>`${name}:${value}`,status:(name,body)=>name+body,rowList:items=>items.map(r=>r.symbol+' '+r.name).join(''),refresh:()=>refreshed++});
 const html=await page.page();assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));assert.ok(html.includes('20 日產業比較'));assert.ok(html.includes('data-rotation-sector="&lt;script&gt;x&lt;/script&gt;"'));assert.ok(!html.includes('產業資金流向（近 5 日）'));assert.ok(!html.includes('法人估算有效成員:0 / 1 檔'));
 page.listen({addEventListener:(event,fn)=>{if(event==='click')listeners.push(fn);}});listeners[2]({target:{closest:selector=>selector==='[data-rotation-sector]'?{dataset:{rotationSector:rows[0].sector}}:null}});assert.equal(refreshed,1);const detail=await page.page();assert.ok(detail.includes('法人估算有效成員:0 / 1 檔'));assert.ok(detail.includes('2330 台積電'));
 rows.splice(0);assert.ok((await page.page()).includes('尚無可統計行情'));assert.ok(!(await page.page()).includes('2330 台積電'));
});

test('sector ranking paginates by ten and opens a selected sector detail',async()=>{
 const rows=Array.from({length:12},(_,index)=>({symbol:String(1000+index),name:`公司${index+1}`,sector:`產業${String(index+1).padStart(2,'0')}`,turnover:100-index,changePercent:index-5}));
 const state={rows,index:{},listing:{cutoff:taipeiDay(),validThrough:taipeiDay(),stocks:Object.fromEntries(rows.map(row=>[row.symbol,{status:'LISTED',eligible:true}]))}};
 const page=createRotationPage({state,card:(title,body)=>`<section>${title}${body}</section>`,metric:(key,value)=>`${key}:${value}`,status:(title,body)=>title+body,rowList:items=>items.map(row=>`${row.name} ${row.symbol}`).join(','),refresh:()=>{}}),handlers=[];
 let html=await page.page();assert.equal((html.match(/class="rotation-rank-row"/g)||[]).length,10);assert.ok(html.includes('第 1／2 頁・1–10／12 個產業'));assert.ok(!html.includes('產業11'));
 page.listen({addEventListener:(event,fn)=>{if(event==='click')handlers.push(fn);}});handlers[3]({target:{closest:selector=>selector==='[data-rotation-page]'?{dataset:{rotationPage:'next'}}:null}});
 html=await page.page();assert.equal((html.match(/class="rotation-rank-row"/g)||[]).length,2);assert.ok(html.includes('產業11'));assert.ok(html.includes('產業12'));assert.ok(!html.includes('產業01'));
 handlers[2]({target:{closest:selector=>selector==='[data-rotation-sector]'?{dataset:{rotationSector:'產業11'}}:null}});html=await page.page();assert.ok(html.includes('返回產業排行'));assert.ok(html.includes('產業11成員'));assert.ok(html.includes('公司11 1010'));
});

test('overflow totals do not display Infinity or fabricated percentages',()=>{
 const groups=rotationGroups([{sector:'big',turnover:1e308,price:1e100,foreignNet:1e200,trustNet:0,dealerNet:0},{sector:'big',turnover:1e308},{sector:'small',turnover:1}]);
 assert.equal(groups.find(g=>g.name==='big').turnover,null);assert.ok(groups.every(g=>g.share===null));
 assert.equal(rotationGroups([{price:1e308,foreignNet:1e308,trustNet:0,dealerNet:0}])[0].flow,null);
});

test('render rechecks expiry before delayed midnight clearing and rejects delisted members',async()=>{
 const state={rows:[{symbol:'2330',sector:'半導體',turnover:100},{symbol:'DEAD',sector:'已下市群',turnover:9999}],index:{},listing:{cutoff:taipeiDay(),validThrough:taipeiDay(),stocks:{2330:{status:'LISTED',eligible:true},DEAD:{status:'DELISTED',eligible:false}}}};
 const page=createRotationPage({state,card:(title,body)=>title+body,metric:(name,value)=>name+value,status:(title,body)=>title+body,rowList:()=>'',refresh:()=>{}});
 assert.ok((await page.page()).includes('半導體'));assert.ok(!(await page.page()).includes('已下市群'));
 state.listing={...state.listing,cutoff:'2000-01-01',validThrough:'2000-01-01'};
 const expired=await page.page();assert.ok(expired.includes('尚無可統計行情'));assert.ok(!expired.includes('data-rotation-group'));assert.equal(state.rows.length,2);
});


test('empty eligible universe does not claim five-day flow estimates exist',async()=>{
 const days=['2026-10-08','2026-10-12','2026-10-13','2026-10-14','2026-10-15'];
 const state={rows:[],index:{latest_daily_tw:days.at(-1),available_days_tw:days},listing:{cutoff:'2026-10-14',validThrough:'2026-10-14',stocks:{}}};
 const requested=[];
 const page=createRotationPage({state,card:(title,body)=>title+body,metric:(name,value)=>name+value,status:(title,body)=>title+body,rowList:()=>'',link:(id,label)=>`<a href="#/${id}">${label}</a>`,publicData:async path=>{requested.push(path);return {stocks:[]};},refresh:()=>{}});
 const html=await page.page();
 assert.equal(requested.length,0);
 assert.ok(html.includes('Public_Data stocks.json 現行名冊，共 0 檔'));
 assert.ok(html.includes('法人估算覆蓋0 / 0 檔'));
 assert.ok(html.includes('近五日法人估算請至'));
 assert.ok(!html.includes('目前已有近 5 日法人金額估算'));
 assert.ok(!html.includes('data-rotation-group'));
 const clickHandlers=[];page.listen({addEventListener:(event,fn)=>{if(event==='click')clickHandlers.push(fn);}});
 clickHandlers[0]({target:{closest:selector=>selector==='[data-rotation-mode]'?{dataset:{rotationMode:'capital'}}:null}});
 const capitalHTML=await page.page();
 assert.ok(capitalHTML.includes('資金輪動象限・逐日回放'));
 assert.ok(!capitalHTML.includes('族群成交熱力圖'));
 assert.ok(!capitalHTML.includes('20 日資金主線・可驗證觀察'));
 assert.ok(capitalHTML.includes('data-rotation-section="heatmap"'));
 const sectionHandlers=[];page.listen({addEventListener:(event,fn)=>{if(event==='click')sectionHandlers.push(fn);}});
 sectionHandlers[1]({target:{closest:selector=>selector==='[data-rotation-section]'?{dataset:{rotationSection:'heatmap'}}:null}});
 const heatmapHTML=await page.page();assert.ok(heatmapHTML.includes('族群成交熱力圖'));assert.ok(!heatmapHTML.includes('資金輪動象限・逐日回放'));
 sectionHandlers[1]({target:{closest:selector=>selector==='[data-rotation-section]'?{dataset:{rotationSection:'mainline'}}:null}});
 const mainlineHTML=await page.page();assert.ok(mainlineHTML.includes('20 日資金主線・可驗證觀察'));assert.ok(!mainlineHTML.includes('族群成交熱力圖'));
 assert.ok(mainlineHTML.includes('族群月曲線'));
 const monthlyHTML=await page.monthlyPage();assert.ok(monthlyHTML.includes('族群月度資金流・Public_Data'));
});

test('M05 rotation keeps history detail reachable without making it a planned concept tab',async()=>{
 const page=createRotationPage({state:{rows:[],index:{},listing:{}},card:(title,body)=>`<section>${title}${body}</section>`,metric:(name,value)=>`${name}:${value}`,status:(title,body)=>title+body,rowList:()=>'',link:(id,label)=>`<a href=\"#/${id}\">${label}</a>`,refresh:()=>{}});
 assert.match(await page.page(),/href=\"#\/rotation-history\">歷史產業輪動/);
});

test('capital rotation visuals use five canonical daily snapshots and retain source date/coverage',async()=>{
 const days=['2026-10-07','2026-10-08','2026-10-09','2026-10-12','2026-10-13'];
 const rows=[{symbol:'2330',name:'台積電',sector:'半導體',turnover:100,price:100,changePercent:1},{symbol:'2317',name:'鴻海',sector:'電子',turnover:50,price:200,changePercent:-1}];
 const state={rows,index:{latest_daily_tw:days.at(-1),available_days_tw:days},listing:{cutoff:taipeiDay(),validThrough:taipeiDay(),stocks:{2330:{status:'LISTED',eligible:true},2317:{status:'LISTED',eligible:true},DEAD:{status:'DELISTED',eligible:false}}}};
 const page=createRotationPage({state,card:(title,body)=>`<section>${title}${body}</section>`,metric:(key,value)=>`${key}:${value}`,status:(title,body)=>`<section>${title}${body}</section>`,rowList:()=>'',link:(id,label)=>`<a href="#/${id}">${label}</a>`,publicData:async path=>{
  if(path==='quant/sector_monthly_flow/index.json')return {date:'2026-10-13',themes:['AI_Ecosystem']};
  if(path==='quant/sector_monthly_flow/AI_Ecosystem.json')return {theme:'AI_Ecosystem',dates:days,industry_net_flow:[1,-2,3,0,4],stocks_data:[{stock_id:'2330',stock_name:'台積電',default_visible:true,cumulative_return:[0,1,2,3,4]},{stock_id:'DEAD',stock_name:'已下市',default_visible:true,cumulative_return:[0,1,2,3,4]}]};
  return {date:path.match(/(\d{4}-\d{2}-\d{2})/)?.[1],stocks:[{id:'2330',c:100,t:100,f:10,it:2,d:0,pct:1},{id:'2317',c:200,t:50,f:-5,it:0,d:0,pct:-1}]};
 },refresh:()=>{}});
 const listeners=[];page.listen({addEventListener:(event,fn)=>{if(event==='click')listeners.push(fn);}});
 listeners[0]({target:{closest:selector=>selector==='[data-rotation-mode]'?{dataset:{rotationMode:'capital'}}:null}});
 const html=await page.page();
 assert.match(html,/資金輪動象限・逐日回放/);assert.match(html,/data-rotation-frame/);assert.match(html,/2026-10-13/);
 assert.doesNotMatch(html,/族群成交熱力圖/);assert.doesNotMatch(html,/主題強弱清單/);assert.doesNotMatch(html,/族群月度資金流/);
 assert.match(html,/族群月曲線/);
 listeners[1]({target:{closest:selector=>selector==='[data-rotation-section]'?{dataset:{rotationSection:'heatmap'}}:null}});
 const heatmap=await page.page();assert.match(heatmap,/族群成交熱力圖/);assert.doesNotMatch(heatmap,/資金輪動象限・逐日回放/);assert.match(heatmap,/台積電|半導體/);assert.ok(!heatmap.includes('已下市'));
 listeners[1]({target:{closest:selector=>selector==='[data-rotation-section]'?{dataset:{rotationSection:'strength'}}:null}});
 const strength=await page.page();assert.match(strength,/主題強弱清單・依成交占比排序/);assert.match(strength,/data-rotation-strength="半導體"/);assert.doesNotMatch(strength,/族群成交熱力圖/);
 listeners[1]({target:{closest:selector=>selector==='[data-rotation-section]'?{dataset:{rotationSection:'five-day'}}:null}});
 const fiveDay=await page.page();assert.match(fiveDay,/近五日資金主線・資料觀察/);assert.match(fiveDay,/族群月曲線/);
 const monthly=await page.monthlyPage();assert.match(monthly,/族群月度資金流・Public_Data/);assert.match(monthly,/成員累積報酬來源原值曲線/);assert.match(monthly,/族群法人每日淨流向/);assert.match(monthly,/href="#\/security\?symbol=2330"/);assert.match(monthly,/查看個股：台積電 2330/);
});
