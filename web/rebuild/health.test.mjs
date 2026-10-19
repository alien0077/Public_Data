import test from 'node:test';
import assert from 'node:assert/strict';
import {renderHealth} from './health.mjs';
import {escapeHTML,number} from './core.mjs';

const card=(title,body)=>`<section><h2>${escapeHTML(title)}</h2>${body}</section>`;
const facts=values=>`<dl>${Object.entries(values).map(([k,v])=>`<dt>${escapeHTML(k)}</dt><dd>${typeof v==='number'?number(v):escapeHTML(v??'資料不足')}</dd>`).join('')}</dl>`;

test('M17 health view includes dated score components, method, source coverage and expiry warning',()=>{
 const html=renderHealth({card,facts},'2330',{name:'台積電'},{date:'2026-10-14',signal:'穩健',health_score:72,method_version:'v2',risk_level:'中',score_components:{technical:60,chip:70,sentiment:80},source_dates:{price:'2026-10-14',weekly:'2026-W40'},freshness:{stale:true},ai_narrative:'<script>unsafe</script>'});
 for(const text of ['台積電 2330','2026-10-14','穩健','技術面','籌碼面','市場情緒','v2','行情','持股週資料','來源資料已過期','&lt;script&gt;unsafe&lt;/script&gt;'])assert.ok(html.includes(text),text);
 assert.doesNotMatch(html,/<script>unsafe<\/script>/);
});

test('M17 health view keeps absent source dates explicit and reports absent narrative',()=>{
 const html=renderHealth({card,facts},'2330',{name:'台積電'},{score_components:{},source_dates:{}});
 assert.ok(html.includes('資料不足'));assert.ok(html.includes('來源尚未提供摘要。'));assert.ok(!html.includes('來源時效警示'));
});

test('M17 health trend uses only recent raw closes, keeps gaps, and gates unloaded periods',()=>{
 const rows=[
  {date:'2026-10-09',close:100,volume:10,gapBefore:false},
  {date:'2026-10-12',close:101,volume:11,gapBefore:false},
  {date:'2026-10-14',close:102,volume:13,gapBefore:true}
 ];
 const html=renderHealth({card,facts},'2330',{name:'台積電'},{date:'2026-10-14',score_components:{},source_dates:{}},{rows,requestedDates:rows.map(x=>x.date),missingDates:['2026-10-13']});
 assert.match(html,/股價趨勢（最近 1 月）/);assert.match(html,/原始 OHLCV/);assert.match(html,/未使用 adj_close/);assert.match(html,/disabled aria-label="3月期間尚未載入"/);assert.match(html,/缺少個股列的交易日/);
 assert.equal((html.match(/stroke="var\(--health-chart-line\)"/g)||[]).length,2,'the curve splits into two paths across the gap');
});
