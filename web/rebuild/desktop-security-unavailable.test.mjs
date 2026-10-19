import test from 'node:test';
import assert from 'node:assert/strict';
import {desktopSecurityUnavailableContent} from './desktop-security-unavailable.mjs';

test('D02 keeps the desktop chart and analysis workspace visible while market eligibility is unknown',()=>{
 const html=desktopSecurityUnavailableContent({name:'台積電',symbol:'2330'});
 assert.match(html,/class="card desktop-security-unavailable-chart"/);
 assert.match(html,/台積電 2330・行情圖表/);
 for(const period of ['日線','週線','月線','1分','5分','15分','30分','60分'])assert.match(html,new RegExp(`disabled[^>]*>${period}<\/button>`));
 assert.match(html,/aria-label="財務籌碼事件與個人紀錄"/);
 for(const label of ['財務','籌碼','事件','我的紀錄','成交量','MACD','營收與獲利表現','獲利能力'])assert.ok(html.includes(label),`missing ${label}`);
 assert.doesNotMatch(html,/1,000|\+90|9\.89%/);
});

test('D02 placeholder safely escapes stock identity and preserves route identity in its links',()=>{
 const html=desktopSecurityUnavailableContent({name:'<img src=x onerror=alert(1)>',symbol:'2330'});
 assert.doesNotMatch(html,/<img/);
 assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);
 for(const route of ['company','flows','news','records'])assert.ok(html.includes(`href="#/${route}?symbol=2330"`));
});
