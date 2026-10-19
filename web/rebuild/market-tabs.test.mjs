import test from 'node:test';
import assert from 'node:assert/strict';
import {marketTabs} from './market-tabs.mjs';

test('M01 mobile navigation exposes all three planned views and marks the active page',()=>{
 const routes=['overview','heatmap','rankings'];
 for(const active of routes){
  const html=marketTabs(active);
  for(const route of routes)assert.ok(html.includes(`href="#/${route}"`));
  assert.equal((html.match(/aria-current="page"/g)||[]).length,1);
  assert.ok(html.includes(`href="#/${active}" aria-current="page"`));
 }
});
