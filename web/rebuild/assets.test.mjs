import test from 'node:test';
import assert from 'node:assert/strict';
import {allocationDonutMarkup,cashflowChartMarkup,matchesAssetTradeFilter,prepareAssetTradeReplacement,profitLossClass} from './assets.mjs';

test('M11 transaction filters separate buys, sells, and all corporate actions',()=>{
 assert.equal(matchesAssetTradeFilter('配息',''),true);
 assert.equal(matchesAssetTradeFilter('買入','買入'),true);
 assert.equal(matchesAssetTradeFilter('賣出','買入'),false);
 assert.equal(matchesAssetTradeFilter('拆股','其他'),true);
 assert.equal(matchesAssetTradeFilter('買入','其他'),false);
});

test('M11 replacement reads the existing row, preserves its identity and unknown fields, and rejects invalid edits',()=>{
 const original={id:'trade-1',type:'買入',date:'2026-10-15',symbol:'2330',name:'台積電',shares:10,price:1500,fee:20,tax:0,currency:'TWD',brokerMemo:'preserve'};
 const {row,expected}=prepareAssetTradeReplacement([original],{price:1499,notes:'修正成交價'},'trade-1');
 assert.equal(expected,original);
 assert.equal(row.id,'trade-1');
 assert.equal(row.price,1499);
 assert.equal(row.brokerMemo,'preserve');
 assert.equal(row.notes,'修正成交價');
 assert.throws(()=>prepareAssetTradeReplacement([original],{shares:-1},'trade-1'),/格式或類型待核對/);
 assert.throws(()=>prepareAssetTradeReplacement([original],{price:1499},'missing'),/找不到原始交易/);
});

test('M09 allocation donut contains only positive priced holdings with escaped identities',()=>{
 const html=allocationDonutMarkup([
  {name:'台積電',symbol:'2330',value:700},
  {name:'<script>',symbol:'2454',value:300},
  {name:'資料不足',symbol:'9999',value:null},
  {name:'零值',symbol:'0000',value:0},
 ],1000);
 assert.match(html,/持股市值配置環圖/);
 assert.match(html,/台積電/);
 assert.match(html,/href="#\/security\?symbol=2330"/);
 assert.match(html,/&lt;script&gt;/);
 assert.doesNotMatch(html,/<script>/);
 assert.doesNotMatch(html,/data-symbol="9999"|data-symbol="0000"/);
 assert.equal((html.match(/<circle data-symbol=/g)||[]).length,2);
});

test('M09 allocation donut legend preserves stock navigation and favorite actions',()=>{
 const html=allocationDonutMarkup([{name:'台積電',symbol:'2330',value:75}],100,(symbol,name,id)=>`<button data-action="favorite" data-symbol="${symbol}" data-favorite-id="${id}" aria-label="加入自選 ${name} ${symbol}">☆</button>`);
 assert.match(html,/href="#\/security\?symbol=2330" aria-label="查看個股：台積電 2330"/);
 assert.match(html,/data-action="favorite" data-symbol="2330" data-favorite-id="allocation-donut-2330"/);
});

test('M09 allocation donut fails closed for incomplete total',()=>{
 assert.match(allocationDonutMarkup([{name:'台積電',symbol:'2330',value:100}],null),/配置資料不足/);
});

test('M09 cashflow chart renders ordered months and separates cashflow types',()=>{
 const html=cashflowChartMarkup(new Map([
  ['2026-02',{buy:200,sell:100,dividend:20}],
  ['2026-01',{buy:150,sell:80,dividend:10}],
 ]));
 assert.ok(html.indexOf('data-month="2026-01"')<html.indexOf('data-month="2026-02"'));
 assert.match(html,/data-kind="buy"/);
 assert.match(html,/data-kind="sell"/);
 assert.match(html,/data-kind="dividend"/);
 assert.match(html,/最近12個有交易月份的現金流柱狀圖/);
});

test('M09 cashflow chart has an honest empty state',()=>{
 assert.match(cashflowChartMarkup(new Map()),/尚無交易資料/);
});

test('M09 cashflow chart caps dense history at the latest twelve transaction months',()=>{
 const months=new Map(Array.from({length:18},(_,i)=>{const date=new Date(Date.UTC(2025,i,1)).toISOString().slice(0,7);return [date,{buy:1,sell:0,dividend:0}];}));
 const html=cashflowChartMarkup(months);
 assert.equal((html.match(/data-kind="buy"/g)||[]).length,12);
 assert.match(html,/最近 12 個有交易月份/);
});


test('Taiwan portfolio profit/loss colors positive red and negative green',()=>{
 assert.equal(profitLossClass(1),'pnl-positive');
 assert.equal(profitLossClass(-1),'pnl-negative');
 assert.equal(profitLossClass(0),'pnl-neutral');
 assert.equal(profitLossClass(null),'pnl-neutral');
});
