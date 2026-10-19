import test from 'node:test';
import assert from 'node:assert/strict';
import {readChart} from './core.mjs';
import {exploreBars} from './explore.mjs';
const payload=()=>({schemaVersion:2,symbol:'2330',source:'data.daily.tw.raw_ohlcv',priceBasis:'raw',sourceManifestSHA256:'a'.repeat(64),dataQuality:'explicit_rejected_dates_v1',rejectedDates:[],timestamp:[1767312000],open:[100],high:[102],low:[99],close:[101],volume:[1000],adj_close:[101],rsi14:[null]});
test('main charts and research reject mismatched stock identity',()=>{
 for(const read of [readChart,exploreBars]){
  assert.equal(read(payload(),'2330').length,1);
  assert.throws(()=>read(payload(),'0050'),/證券/);
  assert.throws(()=>read({...payload(),symbol:undefined},'2330'),/證券/);
 }
});
test('research rejects null, infinite and out-of-range timestamps',()=>{
 for(const timestamp of [null,NaN,Infinity,-1,253402214401])assert.throws(()=>exploreBars({...payload(),timestamp:[timestamp]},'2330'));
});
test('research cannot silently compress exporter-rejected dates',()=>{
 assert.throws(()=>exploreBars({...payload(),rejectedDates:['2026-01-01']},'2330'),/不合格 OHLCV/);
 assert.throws(()=>exploreBars({...payload(),dataQuality:undefined},'2330'),/拒絕日期/);
});
