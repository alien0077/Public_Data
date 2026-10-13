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
test('render escapes source classification, labels missing history and refreshes selection',()=>{
 const rows=[{sector:'<script>x</script>',symbol:'2330',name:'台積電',turnover:1e8}];let refreshed=0,listener;
 const page=createRotationPage({state:{rows,index:{latest_daily_tw:'2026-10-08'},listing:{cutoff:taipeiDay(),validThrough:taipeiDay(),stocks:{2330:{status:'LISTED',eligible:true}}}},card:(name,body)=>body,metric:(name,value)=>`${name}:${value}`,status:(name,body)=>name+body,rowList:items=>items.map(r=>r.symbol+' '+r.name).join(''),refresh:()=>refreshed++});
 const html=page.page();assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));assert.ok(html.includes('5 日產業比較'));assert.ok(html.includes('20 日產業比較'));assert.ok(html.includes('法人估算有效成員:0 / 1 檔'));
 page.listen({addEventListener:(event,fn)=>{if(event==='change')listener=fn;}});listener({target:{id:'rotation-sector',value:rows[0].sector}});assert.equal(refreshed,1);assert.ok(page.page().includes('2330 台積電'));
 rows.splice(0);assert.ok(page.page().includes('尚無可統計行情'));assert.ok(!page.page().includes('2330 台積電'));
});

test('overflow totals do not display Infinity or fabricated percentages',()=>{
 const groups=rotationGroups([{sector:'big',turnover:1e308,price:1e100,foreignNet:1e200,trustNet:0,dealerNet:0},{sector:'big',turnover:1e308},{sector:'small',turnover:1}]);
 assert.equal(groups.find(g=>g.name==='big').turnover,null);assert.ok(groups.every(g=>g.share===null));
 assert.equal(rotationGroups([{price:1e308,foreignNet:1e308,trustNet:0,dealerNet:0}])[0].flow,null);
});

test('render rechecks expiry before delayed midnight clearing and rejects delisted members',()=>{
 const state={rows:[{symbol:'2330',sector:'半導體',turnover:100},{symbol:'DEAD',sector:'已下市群',turnover:9999}],index:{},listing:{cutoff:taipeiDay(),validThrough:taipeiDay(),stocks:{2330:{status:'LISTED',eligible:true},DEAD:{status:'DELISTED',eligible:false}}}};
 const page=createRotationPage({state,card:(title,body)=>title+body,metric:(name,value)=>name+value,status:(title,body)=>title+body,rowList:()=>'',refresh:()=>{}});
 assert.ok(page.page().includes('半導體'));assert.ok(!page.page().includes('已下市群'));
 state.listing={...state.listing,cutoff:'2000-01-01',validThrough:'2000-01-01'};
 const expired=page.page();assert.ok(expired.includes('尚無可統計行情'));assert.ok(!expired.includes('data-rotation-group'));assert.equal(state.rows.length,2);
});
