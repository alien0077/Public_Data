import test from 'node:test';
import assert from 'node:assert/strict';
import {periodRows,periodTrend,periodHistory,dividendYearRows,dividendBars} from './periods.mjs';

test('monthly financial data preserves source fields and displays newest 12 in chronological order',()=>{
 const rows=periodRows({data:[
  {period:'2026-08',value:12,yoy:30,mom:5},
  {period:'2026-07',value:10,yoy:20,mom:4},
  ...Array.from({length:12},(_,i)=>({period:`2025-${String(12-i).padStart(2,'0')}`,value:i+1,yoy:i,mom:0}))
 ]},'revenue');
 assert.equal(rows[0].period,'2026-08');
 const svg=periodTrend(rows,'yoy','年增率・百分比');
 assert.match(svg,/2025-03/);
 assert.match(svg,/2026-08/);
 assert.match(svg,/共 12 期/);
 assert.match(svg,/role="img"/);
});

test('period chart omits missing values and escapes source labels',()=>{
 const svg=periodTrend([{period:'<script>',values:{value:9}},{period:'2026-01',values:{value:null}}],'value','月營收');
 assert.doesNotMatch(svg,/<script>/);
 assert.match(svg,/&lt;script&gt;/);
 assert.match(periodTrend([{period:'2026-01',values:{value:null}}],'value','月營收'),/尚無可繪製/);
});

test('quarterly metrics retain source periods and are never relabeled as standalone quarters',()=>{
 const rows=periodRows({data:[{period:'2026-Q2',eps:49.33,gm:67.03,roe:19.88}]},'earnings');
 assert.equal(rows[0].values.eps,49.33);
 assert.equal(rows[0].period,'2026-Q2');
 assert.equal(rows[0].values.roe,19.88);
});

test('M14 revenue view renders separate raw revenue and YoY charts with mobile-labeled period cells',async()=>{
 const ctx={title:id=>id,publicData:async()=>({data:[{period:'2026-08',value:514805337,yoy:53.32,mom:10.09},{period:'2026-07',value:467580548,yoy:44.68,mom:5.2}]}),card:(title,body)=>`<section><h2>${title}</h2>${body}</section>`,metric:(title,value)=>`<span>${title}:${value}</span>`,status:(title,message)=>`${title}:${message}`};
 const html=await periodHistory(ctx,'revenue','2330',{name:'台積電'});
 assert.match(html,/月營收・千元/);
 assert.match(html,/年增率趨勢・百分比/);
 assert.match(html,/data-label="月營收（千元）"/);
 assert.match(html,/514,805,337/);
});

test('M15 dividends preserve cash and stock units and aggregate only observed source values',()=>{
 const rows=periodRows({data:[{date:'2026-09-16',cash:7,stock:0},{date:'2026-06-11',cash:6,stock:0},{date:'2025-03-01',cash:4,stock:1},{date:'2020-02-01',cash:99,stock:0}]},'dividends');
 const years=dividendYearRows(rows);
 assert.deepEqual(years.map(x=>x.year),['2025','2026']);
 assert.equal(years.find(x=>x.year==='2026').cash,13);
 assert.equal(years.find(x=>x.year==='2025').stock,1);
 const svg=dividendBars(rows);
 assert.match(svg,/現金股利・元／股/);
 assert.match(svg,/股票股利・元／股/);
 assert.doesNotMatch(svg,/2020/);
});
