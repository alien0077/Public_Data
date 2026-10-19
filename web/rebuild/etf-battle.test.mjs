import test from 'node:test';
import assert from 'node:assert/strict';
import {createETFMarketPage,selectETFMarketRows,etfYieldMetric,pageETFMarketRows} from './etf-battle.mjs';

const rows=[
 {symbol:'0050',name:'元大台灣50',securityType:'fund',volume:100,price:150},
 {symbol:'0056',name:'元大高股息',securityType:'fund',volume:90,price:40},
 {symbol:'00679B',name:'元大美債20年',securityType:'fund',volume:80,price:28},
 {symbol:'00881',name:'國泰台灣5G+',securityType:'fund',volume:70,price:20},
 {symbol:'2330',name:'台積電',securityType:'equity',volume:999,price:1000}
];
const categories={
 index:{count:1,etfs:['0050']},
 high_dividend:{count:1,etfs:['0056']},
 bond:{count:1,etfs:['00679B']},
 technology:{count:1,etfs:['00881']}
};

test('M07 今日 ETF 戰情只列 ETF，依成交量排序',()=>{
 assert.deepEqual(selectETFMarketRows(rows,categories,'today').map(row=>row.symbol),['0050','0056','00679B','00881']);
});

test('M07 高股息、主題及債券依 Public_Data category_summary 分類',()=>{
 assert.deepEqual(selectETFMarketRows(rows,categories,'dividend').map(row=>row.symbol),['0056']);
 assert.deepEqual(selectETFMarketRows(rows,categories,'theme').map(row=>row.symbol),['00881']);
 assert.deepEqual(selectETFMarketRows(rows,categories,'bond').map(row=>row.symbol),['00679B']);
});

test('M07 不從基金名稱或殖利率推測缺失分類',()=>{
 assert.deepEqual(selectETFMarketRows(rows,{},'dividend'),[]);
 assert.deepEqual(selectETFMarketRows(rows,{},'theme'),[]);
});

test('M07 missing ETF quotes are reported as quote coverage, not a missing eligibility sidecar',()=>{
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei'}).format(new Date());
 const page=createETFMarketPage({
  state:{rows:[],listing:{cutoff:today,validThrough:today,stocks:{'0050':{status:'LISTED',eligible:true,securityType:'fund'}}},index:{latest_daily_tw:today}},
  card:(title,body)=>`${title}${body}`,
  status:(title,message)=>`${title} ${message}`,
  publicData:async path=>path.includes('category_summary')?categories:{},
  refresh:()=>{}
 });
 const html=page.page();
 assert.match(html,/ETF 行情尚未載入/);
 assert.match(html,/Public_Data 最新台股日行情沒有現行 ETF 報價列/);
 assert.doesNotMatch(html,/上市資格資料缺失|當日上市資格/);
});

test('M07 不把債券殖利率冒充股票型 ETF 配息率',()=>{
 const latest={'00679B':{metrics:{yield:4.3}},'0056':{metrics:{yield:5.2}}};
 assert.deepEqual(etfYieldMetric('00679B',categories,latest),{label:'債券殖利率',value:4.3});
 assert.deepEqual(etfYieldMetric('0056',categories,latest),{label:'配息率',value:null});
});

test('M07 ETF 清單每頁最多十檔，下一頁接續且不漏列',()=>{
 const rows=Array.from({length:23},(_,index)=>({symbol:String(10000+index),name:`基金${index+1}`,securityType:'fund',volume:100-index,price:10}));
 const first=pageETFMarketRows(rows,0),middle=pageETFMarketRows(rows,1),last=pageETFMarketRows(rows,99);
 assert.equal(first.rows.length,10);
 assert.deepEqual(first.rows.map(row=>row.symbol),rows.slice(0,10).map(row=>row.symbol));
 assert.equal(middle.page,1);
 assert.deepEqual(middle.rows.map(row=>row.symbol),rows.slice(10,20).map(row=>row.symbol));
 assert.equal(last.page,2);
 assert.deepEqual(last.rows.map(row=>row.symbol),rows.slice(20).map(row=>row.symbol));
 assert.equal(new Set([...first.rows,...middle.rows,...last.rows].map(row=>row.symbol)).size,23);
});

test('M07 mobile page renders ten ETF cards plus explicit next-ten control',()=>{
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei'}).format(new Date());
 const rows=Array.from({length:12},(_,index)=>({symbol:String(10000+index),name:`基金${index+1}`,securityType:'fund',volume:100-index,price:10,changePercent:0}));
 const page=createETFMarketPage({
  state:{rows,listing:{cutoff:today,validThrough:today,stocks:{}},index:{latest_daily_tw:today}},
  card:(title,body)=>`${title}${body}`,
  status:(title,message)=>`${title} ${message}`,
  publicData:async path=>path.includes('category_summary')?categories:{},
  refresh:()=>{}
 });
 const html=page.page();
 assert.equal((html.match(/class="m07-etf-card"/g)||[]).length,10);
 assert.match(html,/data-etf-battle-page="next"/);
 assert.match(html,/下十檔/);
 assert.doesNotMatch(html,/其餘 \d+ 檔 ETF/);
});
