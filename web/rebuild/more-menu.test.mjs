import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {moreMenuMarkup,moreMenuRouteIDs} from './more-menu.mjs';

const routes=JSON.parse(fs.readFileSync(new URL('./routes.json',import.meta.url),'utf8')).routes;

test('M20 More directory matches the six planned settings categories',()=>{
 const html=moreMenuMarkup(routes);
 assert.deepEqual(moreMenuRouteIDs,['appearance','sync','backup','fx','tools','about']);
 assert.equal((html.match(/class="card more-menu-card"/g)??[]).length,6);
 for(const id of moreMenuRouteIDs)assert.ok(html.includes(`href="#/${id}"`),`M20 menu is missing ${id}`);
 for(const id of ['restore','upgrade','briefing','services'])assert.ok(!html.includes(`href="#/${id}"`),`${id} belongs under its parent menu`);
 assert.match(html,/aria-label="外觀與顯示，主題、字體大小、數字格式與圖表偏好"/);
 assert.match(html,/工具，計算機、除權息與股利試算/);
});

test('M20 fails closed when one of its planned routes is missing',()=>{
 assert.throws(()=>moreMenuMarkup(routes.filter(route=>route.id!=='about')),/M20 menu route is missing: about/);
});
