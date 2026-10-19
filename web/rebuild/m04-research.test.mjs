import test from 'node:test';
import assert from 'node:assert/strict';
import {createM04Research} from './m04-research.mjs';

const context=publicData=>({state:{},card:(title,body)=>`<section>${title}${body}</section>`,status:(title,message)=>`<section>${title} ${message}</section>`,rowList:()=>'',publicData});

test('a 404 sector PE endpoint is reported as unavailable data',async()=>{
 const module=createM04Research(context(async()=>{throw new Error('資料讀取失敗（404）');}));
 const html=await module.page();
 assert.match(html,/族群本益比資料不足/);
 assert.match(html,/quant\/sector_pe\.json 回應 404/);
});

test('non-404 sector PE source errors remain visible to the route error handler',async()=>{
 const module=createM04Research(context(async()=>{throw new Error('網路逾時');}));
 await assert.rejects(module.page(),/網路逾時/);
});
