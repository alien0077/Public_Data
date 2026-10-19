import test from 'node:test';
import assert from 'node:assert/strict';
import {d06FieldTitle,d06FieldValue} from './field-presentation.mjs';

test('D06 field labels match the plan including percentage and currency scales',()=>{
 assert.deepEqual(['price','changePercent','turnover','pe','yield'].map(id=>d06FieldTitle(id,id,'d06')),
  ['股價','漲跌幅(%)','成交金額(億)','本益比(倍)','殖利率(%)']);
 assert.equal(d06FieldTitle('volume','成交量','d06'),'成交量');
 assert.equal(d06FieldTitle('turnover','成交金額'),'成交金額');
});

test('D06 raw turnover is displayed in hundred-million currency units and missing stays explicit',()=>{
 assert.equal(d06FieldValue({turnover:142_629_538_814},'turnover','raw','d06'),'1,426.3');
 assert.equal(d06FieldValue({turnover:0},'turnover','raw','d06'),'0');
 assert.equal(d06FieldValue({turnover:null},'turnover','資料不足','d06'),'資料不足');
});
