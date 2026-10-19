import test from 'node:test';
import assert from 'node:assert/strict';
import {valuationRange} from './valuation-range.mjs';

test('M15 valuation chart preserves published scenario values and labels source market reference',()=>{
 const svg=valuationRange({published_range:{bear:520,base:750,bull:980},range:{bear:400,base:600,bull:800},market_price:834});
 assert.match(svg,/偏空・520 元/);
 assert.match(svg,/基準・750 元/);
 assert.match(svg,/樂觀・980 元/);
 assert.match(svg,/估值來源參考市價 834 元/);
 assert.match(svg,/published_range/);
});

test('M15 valuation chart fails clearly when the source has no valid range',()=>{
 assert.match(valuationRange({}),/來源未提供估值情境區間/);
 assert.match(valuationRange({range:{bear:0,base:null,bull:Infinity}}),/來源未提供有效的正數估值情境/);
});
