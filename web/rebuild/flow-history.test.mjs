import test from 'node:test';
import assert from 'node:assert/strict';
import {institutionalFlowChart,marginBalanceChart,readFlowDay} from './flow-history.mjs';

test('M16 institutional chart preserves lot units, Taiwan movement colors, and escaped identity',()=>{
 const html=institutionalFlowChart([{date:'2026-10-13',foreign:120,trust:-30,dealer:null}],'<台積電>','2330');
 assert.match(html,/&lt;台積電&gt; 2330/);
 assert.match(html,/外資 120 張/);
 assert.match(html,/var\(--up\)/);
 assert.match(html,/var\(--down\)/);
 assert.match(html,/var\(--down\)/);
});

test('M16 margin chart keeps missing values as gaps and does not infer daily deltas',()=>{
 const html=marginBalanceChart([{date:'2026-10-15',margin:120,short:22},{date:'2026-10-14',margin:null,short:20},{date:'2026-10-13',margin:100,short:null}],'台積電','2330');
 assert.match(html,/融資融券餘額趨勢/);
 assert.match(html,/來源只提供餘額時，不推算每日增減量/);
 assert.match(html,/M 56\.0/);
 assert.match(html,/L 706\.0/);
});

test('M16 flow source still validates exact day and never manufactures missing securities',()=>{
 assert.equal(readFlowDay({date:'2026-10-13',stocks:[]},'2330','2026-10-13'),null);
 assert.throws(()=>readFlowDay({date:'2026-10-12',stocks:[]},'2330','2026-10-13'));
});
