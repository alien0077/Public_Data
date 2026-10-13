import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceRSI,rsiSegments,chartIndicators} from './chart.mjs';
test('RSI accepts source endpoints and canonical precedence',()=>{assert.equal(sourceRSI({rsi14:0,rsi:50}),0);assert.equal(sourceRSI({rsi14:100}),100);assert.equal(sourceRSI({rsi:31.25}),31.25);});
test('missing, nonfinite and out of range indicators never become zero',()=>{for(const rsi of [null,undefined,NaN,Infinity,-1,101,'50',''])assert.equal(sourceRSI({rsi}),null);assert.equal(sourceRSI({rsi14:-1,rsi:50}),null);});
test('no raw or adjusted price inference for short or long series',()=>{for(const n of [0,1,13,14,15,300])assert.deepEqual(rsiSegments(Array.from({length:n},(_,i)=>({close:i+1,adj_close:i+2}))),[]);});
test('gaps retain date/index alignment and never bridge missing rows',()=>{const rows=[{date:'a',rsi:20},{date:'b',rsi:30},{date:'c',rsi:null},{date:'d',rsi:0},{date:'e',rsi:NaN},{date:'f',rsi:100}];assert.deepEqual(rsiSegments(rows),[[{index:0,value:20,date:'a'},{index:1,value:30,date:'b'}],[{index:3,value:0,date:'d'}],[{index:5,value:100,date:'f'}]]);});
test('visible slice uses its own coordinates without mutating source',()=>{const rows=[{date:'a',rsi:20},{date:'b',rsi:30},{date:'c',rsi:40}];const before=JSON.stringify(rows);assert.equal(rsiSegments(rows.slice(1))[0][0].index,0);assert.equal(JSON.stringify(rows),before);});
test('source rejection starts new indicator warm-up and segments',()=>{const rows=Array.from({length:90},(_,i)=>({date:String(i),open:i+10,high:i+12,low:i+9,close:i+11,volume:1,gapBefore:i===30}));const result=chartIndicators(rows);assert.equal(result.averages[5][30],null);assert.equal(result.averages[5][33],null);assert.ok(Number.isFinite(result.averages[5][34]));assert.equal(result.dif[30],null);assert.ok(Number.isFinite(result.dif[55]));assert.equal(result.k[37],null);assert.ok(Number.isFinite(result.k[38]));assert.deepEqual(rsiSegments([{date:'29',rsi14:40},{date:'30',rsi14:50,gapBefore:true},{date:'31',rsi14:60}]),[[{index:0,value:40,date:'29'}],[{index:1,value:50,date:'30'},{index:2,value:60,date:'31'}]]);});
import {readChart} from './core.mjs';
test('source RSI stays aligned through chronological sort and OHLC rejection',()=>{
 const x={schemaVersion:2,symbol:'2330',source:'data.daily.tw.raw_ohlcv',priceBasis:'raw',sourceManifestSHA256:'a'.repeat(64),dataQuality:'explicit_rejected_dates_v1',rejectedDates:[],timestamp:[3,1,2],open:[30,10,0],high:[31,11,21],low:[29,9,19],close:[30,10,20],volume:[300,100,200],rsi14:[70,30,50]};
 assert.deepEqual(readChart(x).map(r=>[r.time,r.rsi14]),[[1,30],[3,70]]);
 assert.throws(()=>readChart({...x,rsi14:[70]}),/日期未對齊/);
 assert.throws(()=>readChart({...x,rsi14:'70'}),/日期未對齊/);
 assert.deepEqual(readChart({...x,rsi14:undefined}).map(r=>r.rsi14),[null,null]);
});

import {aggregateChartRows} from './chart.mjs';
test('weekly institutional sums preserve missing values and never adjust volume units',()=>{
 const make=(date,foreign_net,trust_net)=>({date,open:10,high:12,low:9,close:10,adj_close:5,volume:100,foreign_net,trust_net,dealer_net:0});
 const rows=[make('2026-10-05',5,0),make('2026-10-06',null,-2),make('2026-10-07',-1,3)];
 const [week]=aggregateChartRows(rows,'week',true);
 assert.equal(week.close,5);assert.equal(week.foreign_net,null);assert.equal(week.trust_net,1);assert.equal(week.dealer_net,0);assert.equal(week.volume,300);
});
