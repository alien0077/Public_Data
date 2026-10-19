import test from 'node:test';
import assert from 'node:assert/strict';
import {createExploreModule,exploreAnalysis,reportPathDetails,stockDetailLink} from './explore.mjs';

const bars=[
 {date:'2026-01-01',open:100,high:101,low:99,close:100,adjusted:100,volume:100},
 {date:'2026-01-02',open:100,high:101,low:99,close:100,adjusted:100,volume:100},
 {date:'2026-01-03',open:110,high:111,low:109,close:110,adjusted:110,volume:100},
 {date:'2026-01-04',open:120,high:121,low:119,close:120,adjusted:120,volume:100},
];

test('research capital scales quantity and return baseline',()=>{
 const result=exploreAnalysis(bars,{fast:2,slow:3,fee:0,tax:0,initialCapital:2000,entryRule:'close > 0',exitRule:'close < 0'});
 assert.equal(result.trades[0].units,20);
 assert.ok(Math.abs(result.totalReturn-20)<1e-9);
 assert.ok(Math.abs(reportPathDetails(result.curve,2000).annual[0].change-20)<1e-9);
});

test('stock identity in generated research rows links to the security detail',()=>{
 assert.equal(stockDetailLink('2330','台積電'),'<a href="#/security?symbol=2330" aria-label="查看個股：台積電 2330">台積電 2330</a>');
 assert.match(stockDetailLink('A&B','<股票>'),/symbol=A%26B/);
 assert.match(stockDetailLink('A&B','<股票>'),/aria-label="查看個股：&lt;股票&gt; A&amp;B"/);
});

test('research trade and backtest stock links can carry a unique favorite action',()=>{
 const html=stockDetailLink('2330','台積電',(symbol,name,id)=>`<button data-action="favorite" data-symbol="${symbol}" data-favorite-id="${id}" aria-label="加入自選 ${name} ${symbol}">☆</button>`,'explore-trade-2330');
 assert.match(html,/href="#\/security\?symbol=2330"/);
 assert.match(html,/data-action="favorite" data-symbol="2330" data-favorite-id="explore-trade-2330"/);
});

test('holding-day limit closes on the next valid session open',()=>{
 const result=exploreAnalysis(bars,{fast:2,slow:3,fee:0,tax:0,initialCapital:2000,holdingDays:1,entryRule:'close > 0',exitRule:'close < 0'});
 assert.deepEqual(result.trades.map(x=>[x.date,x.side]),[['2026-01-02','買進'],['2026-01-03','賣出'],['2026-01-04','買進']]);
 assert.equal(result.openPosition,true);
});

test('research capital and holding limit reject invalid ranges',()=>{
 assert.throws(()=>exploreAnalysis(bars,{initialCapital:999}),/本金/);
 assert.throws(()=>exploreAnalysis(bars,{holdingDays:501}),/持有上限/);
});


test('strategy laboratory first render keeps its M06 workspace available',async()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>null,setItem:()=>{}}});
 try{
  const module=createExploreModule({
   state:{rows:[],listing:null},
   card:(title,body)=>`<section><h2>${title}</h2>${body}</section>`,
   metric:()=>'',status:()=>'',rowList:()=>'',publicData:async()=>{throw Error('unexpected data request');},
   refresh:async()=>{}
  });
  const html=await module.page('laboratory');
  assert.doesNotMatch(html,/策略邏輯・自然語言描述/);
  assert.match(html,/data-lab-tab="backtest"[^>]*aria-selected="true"/);
  assert.match(html,/data-lab-tab="records"/);
  assert.match(html,/研究本金/);
  assert.match(html,/持有上限/);
  assert.match(html,/執行策略研究/);
  assert.match(html,/已儲存的策略/);
  assert.doesNotMatch(html,/strategyGenerationError is not defined/);
 }finally{
  if(previous)Object.defineProperty(globalThis,'localStorage',previous);else delete globalThis.localStorage;
 }
});

test('M06 laboratory shows saved strategies below the research form and links to records',async()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
 const fixture={'qa-saved':{id:'qa-saved',name:'M06 測試策略',prompt:'20 日均線突破',buyCondition:{},sellCondition:{}}};
 const values=new Map([['rebuild.savedStrategies.v1',JSON.stringify(fixture)],['rebuild.activeStrategy.v1','qa-saved']]);
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)}});
 try{
  const module=createExploreModule({
   state:{rows:[],listing:null},card:(title,body)=>`<section><h2>${title}</h2>${body}</section>`,
   metric:()=>'',status:()=>'',rowList:()=>'',publicData:async()=>{throw Error('unexpected data request');},refresh:async()=>{}
  });
  const html=await module.page('laboratory');
  assert.doesNotMatch(html,/策略邏輯・自然語言描述/);
  assert.match(html,/已儲存的策略（1）/);
  assert.match(html,/M06 測試策略/);
  assert.match(html,/data-lab-tab="records">管理策略紀錄/);
  assert.ok(html.indexOf('研究本金')<html.indexOf('已儲存的策略（1）'));
 }finally{
  if(previous)Object.defineProperty(globalThis,'localStorage',previous);else delete globalThis.localStorage;
 }
});

test('M06 natural-language strategy draft remains available under strategy records',async()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
 const values=new Map();
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)}});
 try{
  const module=createExploreModule({state:{rows:[],listing:null},card:(title,body)=>`<section><h2>${title}</h2>${body}</section>`,metric:()=>'',status:()=>'',rowList:()=>'',publicData:async path=>path==='quant/latest_strategies.json'?{strategies:[]}:Promise.reject(Error('unexpected data request')),refresh:async()=>{}});
  const clickHandlers=[];
  module.listen({addEventListener:(type,handler)=>{if(type==='click')clickHandlers.push(handler);}});
  const event={target:{closest:selector=>selector==='[data-lab-tab]'?{dataset:{labTab:'records'}}:null}};
  for(const handler of clickHandlers)await handler(event);
  const html=await module.page('laboratory');
  assert.match(html,/策略邏輯・自然語言描述/);
  assert.match(html,/data-lab-tab="records"[^>]*aria-selected="true"/);
  assert.match(html,/Public_Data 來源策略/);
  assert.match(html,/策略紀錄/);
 }finally{
  if(previous)Object.defineProperty(globalThis,'localStorage',previous);else delete globalThis.localStorage;
 }
});
