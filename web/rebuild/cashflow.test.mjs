import test from 'node:test';
import assert from 'node:assert/strict';
import {cashflowRecords} from './cashflow.mjs';
test('cash dividends use native credited amount instead of multiplying price',()=>{
 const source=[{type:'配息',symbol:'2330',name:'台積電',shares:2000,price:5,date:'2026-07-01'},{type:'買入',symbol:'2330',shares:100,price:100,date:'2026-01-01'}];
 const before=JSON.stringify(source),r=cashflowRecords(source);
 assert.equal(r.records.length,1);assert.equal(r.records[0].amount,2000);assert.equal(JSON.stringify(source),before);assert.deepEqual(r.issues,[]);
});
test('historical delisted dividends remain visible and missing names use metadata',()=>{
 const r=cashflowRecords([{type:'配息',symbol:'1234',name:'',shares:0,date:'2025-01-01'}],[{symbol:'1234',name:'歷史證券',eligible:false}]);
 assert.equal(r.records[0].name,'歷史證券');assert.equal(r.records[0].amount,0);
});
test('missing amounts and unknown numeric date epochs remain explicit',()=>{
 const r=cashflowRecords([{type:'配息',symbol:'2330',price:10,quantity:100,date:123},{type:'配息',symbol:'2330',shares:Infinity,date:'2026-07-01'}]);
 assert.equal(r.records.length,2);assert.equal(r.records[0].amount,null);assert.equal(r.records[1].date,null);assert.equal(r.issues.length,1);
});
test('records sort by source date and do not combine currencies',()=>{
 const r=cashflowRecords([{type:'配息',symbol:'AAPL',shares:5,date:'2025-01-01'},{type:'配息',symbol:'2330',shares:100,date:'2026-01-01'}]);
 assert.deepEqual(r.records.map(x=>x.symbol),['2330','AAPL']);assert.equal('total' in r,false);
});

test('invalid calendar dates and unknown transaction types stay visible as issues',()=>{const r=cashflowRecords([{type:'配息',symbol:'2330',shares:10,date:'2026-02-30'},{type:'foreign-format',symbol:'2330'}]);assert.equal(r.records[0].date,null);assert.equal(r.issues.length,2);});

import {tradeProjection} from './core.mjs';
test('valid cash dividends do not change holdings or become unknown trades',()=>{const b={symbol:'2330',name:'台積電',type:'買入',shares:10,price:100,fee:1,tax:0,date:'2026-01-01'},d={symbol:'2330',type:'配息',shares:2000,date:'2026-07-01'};assert.deepEqual(tradeProjection([b,d],[]),tradeProjection([b],[]));assert.equal(tradeProjection([b,{...d,shares:null}],[]).issues.length,1);});
