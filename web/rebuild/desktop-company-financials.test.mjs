import test from 'node:test';
import assert from 'node:assert/strict';
import {desktopCompanyFinancials} from './desktop-company-financials.mjs';

const monthly={stock_id:'2330',data:[
 {period:'2026-08',value:514805337,yoy:53.32},
 {period:'2026-07',value:467580548,yoy:44.68},
 {period:'2026-06',value:263709000,yoy:null}
]};
const quarterly={data:[
 {period:'2026-Q2',eps:49.33,gm:67.03,om:59.29,nm:53.19,roe:19.88,bvps:248.05},
 {period:'2026-Q1',eps:13.94,gm:58.8,om:48.5,nm:45.2,roe:6.1,bvps:196.3},
 {period:'2025-Q4',eps:19.5,gm:62.3,om:53.7,nm:47.1,roe:9.4,bvps:221.7},
 {period:'2025-Q3',eps:12,gm:60,om:50,nm:44,roe:7,bvps:205}
]};

test('D02 desktop summary uses canonical monthly revenue and latest three source quarters',async()=>{
 const requests=[];
 const html=await desktopCompanyFinancials({
  publicData:async path=>{requests.push(path);if(path==='monthly/2330.json')return monthly;if(path==='quarterly/2330.json')return quarterly;throw Error(path);},
  card:(title,body)=>`<section><h2>${title}</h2>${body}</section>`
 },'2330',{name:'台積電'});
 assert.deepEqual(requests.sort(),['monthly/2330.json','quarterly/2330.json']);
 assert.match(html,/台積電 2330 最近3期月營收與年增率來源圖/);
 assert.match(html,/月營收 5,148\.05 億元/);
 assert.match(html,/2026-Q2/);assert.match(html,/2026-Q1/);assert.match(html,/2025-Q4/);
 assert.doesNotMatch(html,/2025-Q3/);
 assert.match(html,/來源期間 EPS（元）/);assert.match(html,/67\.03/);assert.match(html,/每股淨值（元）/);
});

test('D02 financial summary escapes source identity and marks absent metrics instead of filling values',async()=>{
 const html=await desktopCompanyFinancials({
  publicData:async path=>path.startsWith('monthly/')?{stock_id:'2330',data:[{period:'2026-08',value:100000,yoy:null}]}:{data:[{period:'2026-Q2',eps:1.25,gm:null}]},
  card:(title,body)=>`<section><h2>${title}</h2>${body}</section>`
 },'2330',{name:'<script>alert(1)</script>'});
 assert.doesNotMatch(html,/<script>/);assert.match(html,/&lt;script&gt;/);
 assert.match(html,/月營收 1 億元/);assert.doesNotMatch(html,/年增率 [\d-]+(?:\.\d+)?%/);
 assert.match(html,/資料不足/);
});

test('D02 financial summary rejects a monthly source file for another security',async()=>{
 await assert.rejects(()=>desktopCompanyFinancials({
  publicData:async path=>path.startsWith('monthly/')?{stock_id:'1101',data:[{period:'2026-08',value:100000,yoy:5}]}:quarterly,
  card:(title,body)=>`<section>${title}${body}</section>`
 },'2330',{name:'台積電'}),/代號與所選證券不符/);
});
