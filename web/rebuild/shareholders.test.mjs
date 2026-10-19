import test from 'node:test';
import assert from 'node:assert/strict';
import {validateShareholderSnapshot,shareholderDistributionPage} from './shareholders.mjs';

const defs=Array.from({length:15},(_,i)=>({level:i+1,label:`級距${i+1}`}));
const manifest={schemaVersion:1,date:'2026-10-09',source:'TDCC official open data id=1-5',sourceSha256:'a'.repeat(64),levelCount:15,levelDefinitions:defs,symbolToShard:{2330:'shard-000.json'}};
const levels=defs.map((item,i)=>({...item,holders:10+i,shares:1000+i,percentage:i===14?72:2}));
const shard={schemaVersion:1,date:manifest.date,sourceSha256:manifest.sourceSha256,securities:{2330:{sourceDate:manifest.date,complete:true,totalHolders:500,totalShares:1_000_000,totalPercentage:100,adjustment:{holders:0,shares:-1,percentage:0},levels}}};

test('M16 TDCC snapshot accepts only complete dated official levels and exact source hash',()=>{
 assert.equal(validateShareholderSnapshot(manifest,shard,'2330','2026-10-15').levels.length,15);
});

test('M16 TDCC snapshot rejects stale-schema mismatch, future dates, unsafe shards and incomplete tiers',()=>{
 assert.throws(()=>validateShareholderSnapshot({...manifest,date:'2026-10-16'},shard,'2330','2026-10-15'),/manifest/);
 assert.throws(()=>validateShareholderSnapshot({...manifest,symbolToShard:{2330:'../latest.json'}},shard,'2330','2026-10-15'),/no such|沒有此證券/);
 const bad={...shard,securities:{2330:{...shard.securities[2330],levels:levels.slice(1)}}};
 assert.throws(()=>validateShareholderSnapshot(manifest,bad,'2330','2026-10-15'),/資料不完整/);
 const hashMismatch={...shard,sourceSha256:'b'.repeat(64)};
 assert.throws(()=>validateShareholderSnapshot(manifest,hashMismatch,'2330','2026-10-15'),/雜湊/);
});

test('M16 shareholders render the observed official snapshot and preserve the separate source aggregate',async()=>{
 const ctx={card:(title,body)=>`<section><h2>${title}</h2>${body}</section>`,metric:(label,value)=>`<span>${label}:${value}</span>`,status:(title,message)=>`<section>${title}:${message}</section>`,publicData:async path=>{
  if(path==='rebuild/shareholder-distribution/manifest.json')return manifest;
  if(path==='rebuild/shareholder-distribution/shard-000.json')return shard;
  if(path==='stocks/2330.json')return {source_dates:{weekly:'2026-10-09'},tdcc:{big_holder_change:0.1,retail_holder_change:-0.1,holder_concentration:72}};
  throw new Error(`unexpected path ${path}`);
 }};
 const html=await shareholderDistributionPage(ctx,'2330',{name:'台積電'});
 assert.match(html,/台積電 2330/);
 assert.match(html,/官方摘要・彙總指標/);
 assert.match(html,/持股級距明細/);
 assert.match(html,/TDCC 1-5/);
 assert.match(html,/人數/);
 assert.match(html,/占比/);
});
