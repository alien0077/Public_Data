import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {conceptTabs} from './concept-tabs.mjs';

const routes=JSON.parse(fs.readFileSync(new URL('./routes.json',import.meta.url),'utf8')).routes;
const style=fs.readFileSync(new URL("./style.css",import.meta.url),"utf8");
const appSource=fs.readFileSync(new URL('./app.mjs',import.meta.url),'utf8');
const exploreMarketSource=fs.readFileSync(new URL('./explore-market.mjs',import.meta.url),'utf8');

test('M02 exposes watchlist, categories and search as mobile page tabs',()=>{
 for(const id of ['watchlist','groups','search']){
  const html=conceptTabs(routes,id);
  assert.equal((html.match(/<a /g)??[]).length,3);
  assert.match(html,/aria-label="M02 頁面切換"/);
  for(const target of ['watchlist','groups','search'])assert.ok(html.includes(`href="#/${target}"`));
  assert.match(html,new RegExp(`href=\"#/${id}\" aria-current=\"page\"`));
 }
});

test('security concept tabs preserve the selected stock identity',()=>{
 const html=conceptTabs(routes,'candles',{symbol:'2330'});
 assert.match(html,/href="#\/security\?symbol=2330"/);
 assert.match(html,/href="#\/intraday\?symbol=2330"/);
 assert.match(html,/href="#\/candles\?symbol=2330" aria-current="page"/);
});

test('state samples, dark-mode comparison screens, M01 and M25 keep dedicated navigation',()=>{
 for(const id of ['empty','error','offline','dark-watchlist','dark-security','dark-etf','overview','heatmap','rankings','more','appearance','sync','tools','about','briefing','fx','services'])
  assert.equal(conceptTabs(routes,id), '');
});

test('M20 settings and M21 transfer routes use pushed-page navigation instead of peer tabs',()=>{
 for(const id of ['more','appearance','sync','tools','about','backup','restore','upgrade'])assert.equal(conceptTabs(routes,id),'');
});

test('single-page, unknown and supplemental detail routes do not render a concept tab bar',()=>{
 for(const id of ['launch','missing','rotation-history','strategy'])assert.equal(conceptTabs(routes,id),'');
});

test('M07 mobile concept navigation matches the three planned preview screens',()=>{
 const html=conceptTabs(routes,'backtest');
 assert.equal((html.match(/<a /g)??[]).length,3);
 for(const id of ['backtest','themes','etfs'])assert.ok(html.includes(`href="#/${id}"`));
 assert.ok(!html.includes('rotation-history'));
});

test('every multi-screen M03-M22 concept exposes its complete route group',()=>{
 for(let number=3;number<=22;number++){
  const concept=`M${String(number).padStart(2,'0')}`;
  const pages=routes.filter(route=>route.concept===concept&&!['rotation-history','strategy'].includes(route.id));
  assert.ok(pages.length>=2,`${concept} should have multiple planned screens`);
  if(['M20','M21'].includes(concept)){
   for(const page of pages)assert.equal(conceptTabs(routes,page.id),'',`${concept} uses a directory/flow with pushed subpages, not a tab bar`);
   continue;
  }
  const html=conceptTabs(routes,pages[0].id);
  assert.equal((html.match(/<a /g)??[]).length,pages.length,`${concept} should expose all routes`);
  assert.match(html,new RegExp(`aria-label="${concept} 頁面切換"`));
 }
});

test('M05 excludes contextual strategy detail from peer tabs while keeping its route',()=>{const route=routes.find(item=>item.id==='strategy');assert.ok(route);assert.equal(route.concept,'M05');assert.equal(conceptTabs(routes,'strategy'),'');const html=conceptTabs(routes,'rotation');assert.equal((html.match(/<a /g)??[]).length,3);assert.ok(!html.includes('#/strategy'));});
test('M05 App and Web route catalog both expose the sector monthly flow page',()=>{const route=routes.find(item=>item.id==='sector-monthly-flow');assert.ok(route);assert.equal(route.concept,'M05');assert.equal(route.path,'/sector-monthly-flow');assert.ok(route.mobilePlatforms.includes('ios')&&route.mobilePlatforms.includes('web'));});
test("mobile concept tabs match the native one-row interaction and retain 44px targets",()=>{assert.ok(style.includes(".concept-tabs[data-count=\"4\"]{grid-template-columns:repeat(4,minmax(0,1fr))}"));assert.match(style,/\.concept-tabs>a\{[^}]*min-height:44px/);assert.ok(!style.includes(".concept-tabs[data-count=\"4\"]{display:flex;overflow-x:auto"));});
test('Explore exposes the M05 capital rotation route from its market summary',()=>{assert.match(appSource,/exploreMarketMarkup/);assert.match(exploreMarketSource,/link\('rotation','資金輪動'\)/);});
test('mobile concept labels clamp to two readable lines while retaining accessible full names',()=>{const html=conceptTabs(routes,'etf-flows');assert.match(html,/<span class=\"concept-tab-label\">ETF 申購／買回單位變化<\/span>/);assert.match(style,/\.concept-tabs>a\{[^}]*min-height:44px/);assert.match(style,/\.concept-tabs>a \.concept-tab-label\{[^}]*-webkit-line-clamp:2[^}]*overflow-wrap:anywhere/);});

test('versioned mobile-tab module is precached so a new shell cannot reuse the previous worker copy',()=>{const sw=fs.readFileSync(new URL('./sw.js',import.meta.url),'utf8');assert.match(appSource,/from ['\"]\.\/concept-tabs\.mjs\?v=3['\"]/);assert.match(sw,/concept-tabs\.mjs\?v=3/);});
