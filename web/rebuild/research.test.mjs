import assert from 'node:assert/strict';
import test from 'node:test';
import {fxConversion,fxRateDisplay,fxRangePoints,fxTrendChart,m25Tabs,uniquePublishDates,validFxRows} from './research.mjs';

test('FX rates preserve small non-zero values and distinguish zero or invalid rates',()=>{
 assert.equal(fxRateDisplay(32.114),'32.114');
 assert.equal(fxRateDisplay(0.0012363),'0.0012363');
 assert.equal(fxRateDisplay(0.001791),'0.001791');
 assert.equal(fxRateDisplay(0),'資料不足');
 assert.equal(fxRateDisplay(Number.NaN),'資料不足');
 assert.equal(fxConversion(1000,1,32.114),1000/32.114);
 assert.equal(fxConversion(1000,1,0.0012363),1000/0.0012363);
 assert.equal(fxConversion(1000,1,0),null);
});

test('FX history ranges return canonical USD/TWD points for the selected calendar window',()=>{
 const end=new Date('2026-10-14T00:00:00Z'),rows=Array.from({length:365},(_,i)=>{const d=new Date(end);d.setUTCDate(d.getUTCDate()-i);return {date:d.toISOString().slice(0,10),USD_TWD:32+i/1000};});
 assert.equal(fxRangePoints(rows,'1w').length,7);
 assert.equal(fxRangePoints(rows,'1m').length,31);
 assert.equal(fxRangePoints(rows,'3m').length,93);
 const year=fxRangePoints(rows,'1y');assert.equal(year.length,365);assert.equal(year[0].date,'2025-10-15');assert.equal(year.at(-1).date,'2026-10-14');
 assert.deepEqual(fxRangePoints(rows,'invalid'),[]);
});

test('FX history chart exposes a dated SVG curve and an explicit insufficient-data state',()=>{
 const points=[{date:'2026-10-13',value:32.1},{date:'2026-10-14',value:32.114}];
 const svg=fxTrendChart(points);assert.match(svg,/<svg[^>]+role="img"/);assert.match(svg,/2026-10-13 至 2026-10-14/);assert.match(svg,/<polyline/);assert.match(fxTrendChart(points.slice(0,1)),/歷史資料不足/);
});

test('M25 subnavigation exposes all three planned sections and selects the current route',()=>{
 const html=m25Tabs('fx');assert.match(html,/href="#\/briefing"/);assert.match(html,/href="#\/fx" aria-current="page"/);assert.match(html,/href="#\/services"/);
});

test('M25 briefing date choices are unique, calendar-valid publication dates sorted newest first',()=>{
 const episodes=[{publish_date:'2026-09-11'},{publish_date:'2026-09-15'},{publish_date:'2026-09-11'},{publish_date:'2026-02-30'},{publish_date:'invalid'},{publish_date:null},{title:'missing date'}];
 assert.deepEqual(uniquePublishDates(episodes),['2026-09-15','2026-09-11']);
 assert.deepEqual(uniquePublishDates([]),[]);
});


test('FX history rejects invalid calendar dates and non-positive quotes and deduplicates dates',()=>{
 const rows=[
  {date:'2026-02-28',USD_TWD:32.1},
  {date:'2026-02-30',USD_TWD:32.2},
  {date:'2026-03-01',USD_TWD:0},
  {date:'2026-03-02',USD_TWD:-1},
  {date:'2026-03-03',USD_TWD:Number.NaN},
  {date:'2026-02-28',USD_TWD:32.15},
  {date:'2026-03-04',USD_TWD:32.4},
  {date:'not-a-date',USD_TWD:32.3}
 ];
 assert.deepEqual(validFxRows(rows,'2026-03-03'),[{date:'2026-02-28',USD_TWD:32.15}]);
 assert.deepEqual(fxRangePoints(rows,'1w','2026-03-03'),[{date:'2026-02-28',value:32.15}]);
});
