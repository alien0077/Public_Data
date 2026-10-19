import test from 'node:test';
import assert from 'node:assert/strict';
import {parseLocalStrategyPrompt} from './strategy-prompt.mjs';

test('local strategy parser mirrors the supported native fallback rules',()=>{
 const parsed=parseLocalStrategyPrompt('強勢站上年線，20日均線突破');
 assert.equal(parsed.name,'本機策略：強勢站上年線，20日均線突破…');
 assert.deepEqual(parsed.buyCondition,{and:[
  {factor:{type:'mom20',op:'>',value:.75,targetFactor:null,offset:0,period:0,params:null}},
  {factor:{type:'trend',op:'>',value:.8,targetFactor:null,offset:0,period:0,params:null}},
  {factor:{type:'close_price',op:'>',value:null,targetFactor:'ma20',offset:0,period:0,params:null}}
 ]});
 assert.deepEqual(parsed.sellCondition,{factor:{type:'close_price',op:'<',value:null,targetFactor:'ma20',offset:0,period:0,params:null}});
});

test('local strategy parser rejects unsupported or malformed prompts without guessing',()=>{
 assert.equal(parseLocalStrategyPrompt('買進我喜歡的股票'),null);
 assert.equal(parseLocalStrategyPrompt('RS 大於'),null);
 assert.equal(parseLocalStrategyPrompt('動能強'.repeat(1000)),null);
});
