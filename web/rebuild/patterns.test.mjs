import test from 'node:test';
import assert from 'node:assert/strict';
import {filterPatternSignals} from './patterns.mjs';

const signals=[
 {type:'牛旗',id:'b1'},{type:'雙底',id:'b2'},{type:'成交量突破',id:'v1'},
 {type:'未分類新型態',id:'other'}
];

test('pattern categories filter only actual single-security signals',()=>{
 assert.deepEqual(filterPatternSignals(signals,'all'),signals);
 assert.deepEqual(filterPatternSignals(signals,'breakout').map(x=>x.id),['b1']);
 assert.deepEqual(filterPatternSignals(signals,'bottom').map(x=>x.id),['b2']);
 assert.deepEqual(filterPatternSignals(signals,'volume').map(x=>x.id),['v1']);
 assert.deepEqual(filterPatternSignals(signals,'unknown'),signals);
 assert.deepEqual(filterPatternSignals(null,'volume'),[]);
});
