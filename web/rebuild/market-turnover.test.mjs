import test from 'node:test';
import assert from 'node:assert/strict';
import {verifiedMarketTurnover} from './market-turnover.mjs';

const rows=Array.from({length:2000},(_,i)=>({id:String(i),date:'2026-10-16',t:i+1}));
test('market turnover uses a complete same-day canonical raw file',()=>{
 const result=verifiedMarketTurnover({date:'2026-10-16',stocks:rows},'2026-10-16');
 assert.equal(result.value,2_001_000);assert.equal(result.rowCount,2000);assert.equal(result.date,'2026-10-16');
});
test('market turnover fails closed for stale, sparse, duplicate, or missing raw values',()=>{
 assert.equal(verifiedMarketTurnover({date:'2026-10-15',stocks:rows},'2026-10-16').value,null);
 assert.equal(verifiedMarketTurnover({date:'2026-10-16',stocks:rows.slice(0,1999)},'2026-10-16').value,null);
 assert.equal(verifiedMarketTurnover({date:'2026-10-16',stocks:[...rows.slice(1),rows[1]]},'2026-10-16').value,null);
 assert.equal(verifiedMarketTurnover({date:'2026-10-16',stocks:rows.map((row,i)=>i===0?{...row,t:null}:row)},'2026-10-16').value,null);
 assert.equal(verifiedMarketTurnover({date:'2026-10-16',stocks:rows.map((row,i)=>i===0?{...row,date:'2026-10-15'}:row)},'2026-10-16').value,null);
});
