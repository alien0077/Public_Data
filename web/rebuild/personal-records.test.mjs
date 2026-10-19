import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePersonalRecord,reminderStatus} from './personal-records.mjs';
const record=()=>({schemaVersion:1,symbol:'2330',name:'台積電',note:'觀察營收',enabled:true,direction:'above',target:1000,updatedAt:'2026-10-13T06:00:00Z'});
test('personal record validates identity, finite targets and schema',()=>{
 assert.equal(validatePersonalRecord(record(),'2330').note,'觀察營收');
 for(const patch of [{schemaVersion:2},{symbol:'0050'},{target:NaN},{target:0},{target:null},{direction:'unknown'},{note:'x'.repeat(10001)}])assert.throws(()=>validatePersonalRecord({...record(),...patch},'2330'));
 assert.doesNotThrow(()=>validatePersonalRecord({...record(),enabled:false,target:null},'2330'));
});
test('reminders use only eligible raw quotes, equality triggers both bounds',()=>{
 const row={eligible:true,price:1000,asOf:'2026-10-12'};
 assert.match(reminderStatus(record(),row),/^已達設定條件/);
 assert.match(reminderStatus({...record(),direction:'below'},row),/^已達設定條件/);
 assert.match(reminderStatus(record(),{...row,price:999}),/^尚未達設定條件/);
 assert.match(reminderStatus(record(),{...row,eligible:false}),/沒有可判斷/);
 assert.match(reminderStatus(record(),{...row,price:null}),/沒有可判斷/);
 assert.match(reminderStatus({...record(),enabled:false},row),/尚未啟用/);
});
