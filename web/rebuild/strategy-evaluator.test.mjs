import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateSourceDSL,sourceFactors} from './strategy-evaluator.mjs';

test('inst_buy >= Nd uses the consecutive five-session flow factor and fails closed when absent',()=>{
 assert.equal(evaluateSourceDSL('inst_buy >= 5d',{inst_buy:5}).matched,true);
 assert.equal(evaluateSourceDSL('inst_buy >= 5d',{inst_buy:4}).matched,false);
 assert.equal(evaluateSourceDSL('inst_buy >= 5d',{}).matched,null);
});

test('AI_INST exit DSL treats B as a latched-state input plus the MA10 break condition',()=>{
 assert.equal(evaluateSourceDSL('b_signal + close < ma10',{b_signal:1,close:9,ma10:10}).matched,true);
 assert.equal(evaluateSourceDSL('b_signal + close < ma10',{b_signal:0,close:9,ma10:10}).matched,false);
 assert.equal(evaluateSourceDSL('b_signal + close < ma10',{close:9,ma10:10}).matched,null);
});

test('sourceFactors only publishes a five-day institutional factor from complete lots data',()=>{
 const bars=[1,2,3,4,5].map((adjusted,i)=>({adjusted,foreignNet:2,trustNet:1}));
 assert.equal(sourceFactors(bars).inst_buy,5);
 assert.equal(sourceFactors(bars.map((x,i)=>i===2?{...x,trustNet:null}:x)).inst_buy,undefined);
});
