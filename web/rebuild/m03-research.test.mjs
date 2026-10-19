import assert from 'node:assert/strict';
import test from 'node:test';
import {createM03Research,pageM03Rows} from './m03-research.mjs';
import {taipeiDay} from './core.mjs';

const days=['2026-10-12','2026-10-13','2026-10-14','2026-10-15','2026-10-16'];
const snapshots=Object.fromEntries(days.map((date,index)=>[date,{date,stocks:[{
 id:'2330',c:100+index*1.25,v:300000,f:1200,it:300,d:100
}]}]));

function makePage(){
 const paths=[];
 const state={
  index:{latest_daily_tw:days.at(-1),available_days_tw:days},
  listing:{cutoff:taipeiDay(),validThrough:taipeiDay(),stocks:{'2330':{status:'LISTED',eligible:true,securityType:'equity'}}},
  rows:[{symbol:'2330',name:'台積電',price:105,changePercent:1,securityType:'equity'}]
 };
 const favoriteButton=(symbol,name,id)=>`<button type="button" class="star" data-action="favorite" data-symbol="${symbol}" data-favorite-id="${id}" aria-label="加入預設自選 ${name} ${symbol}" aria-pressed="false">☆</button>`;
 const ctx={
  state, favoriteButton,
  card:(title,body)=>`<section><h2>${title}</h2>${body}</section>`,
  status:(title,message)=>`<div role="status"><strong>${title}</strong>${message}</div>`,
  publicData:async path=>{paths.push(path);const date=path.match(/daily\/tw\/(\d{4}-\d{2}-\d{2})\.json/)?.[1];if(date&&snapshots[date])return snapshots[date];throw Error(`Unexpected Public_Data path: ${path}`);}
 };
 return {module:createM03Research(ctx),paths};
}

test('M03 institutional stock cards keep the stock link and add a working favorite action hook',async()=>{
 const original=globalThis.localStorage;
 globalThis.localStorage={getItem:()=>null,setItem:()=>{}};
 try{
  const {module}=makePage(),html=await module.page('institutional');
  assert.match(html,/href="#\/security\?symbol=2330"/);
  assert.match(html,/m03-stock-card[\s\S]*data-action="favorite" data-symbol="2330" data-favorite-id="m03-2330"/);
  assert.match(html,/加入預設自選 台積電 2330/);
 }finally{if(original===undefined)delete globalThis.localStorage;else globalThis.localStorage=original;}
});

test('M03 quick-filter stock cards keep the stock link and add a working favorite action hook',async()=>{
 const original=globalThis.localStorage;
 globalThis.localStorage={getItem:()=>null,setItem:()=>{}};
 try{
  const {module}=makePage(),html=await module.page('quick-filter');
  assert.match(html,/href="#\/security\?symbol=2330"/);
  assert.match(html,/m03-stock-card[\s\S]*data-action="favorite" data-symbol="2330" data-favorite-id="m03-2330"/);
  assert.match(html,/加入預設自選 台積電 2330/);
 }finally{if(original===undefined)delete globalThis.localStorage;else globalThis.localStorage=original;}
});

test('M03 institutional and quick-filter lists page ten stocks at a time without gaps',()=>{
 const rows=Array.from({length:23},(_,index)=>({symbol:String(1100+index)}));
 const first=pageM03Rows(rows,0),middle=pageM03Rows(rows,1),last=pageM03Rows(rows,99);
 assert.equal(first.rows.length,10);
 assert.deepEqual(middle.rows,rows.slice(10,20));
 assert.deepEqual(last.rows,rows.slice(20));
 assert.equal(last.page,2);
 assert.equal(new Set([...first.rows,...middle.rows,...last.rows].map(row=>row.symbol)).size,23);
});
