import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {bottomNavMarkup} from './bottom-nav.mjs';

const tabs=JSON.parse(fs.readFileSync(new URL('./routes.json',import.meta.url),'utf8')).tabs;
const css=fs.readFileSync(new URL('./bottom-nav.css',import.meta.url),'utf8');
test('M20 mobile navigation uses all five planned pictograms and route links',()=>{
 const html=bottomNavMarkup(tabs,'more');
 assert.equal((html.match(/<a href=/g)??[]).length,5);
 assert.equal((html.match(/<svg /g)??[]).length,5);
 for(const [id,label] of [['market','市場'],['watchlist','自選'],['explore','探索'],['assets','資產'],['more','更多']]){
  const tab=tabs.find(item=>item.id===id);
  assert.ok(html.includes(`href="#/${tab.root}"`));
  assert.ok(html.includes(`<span>${label}</span>`));
 }
 assert.match(html,/<a href="#\/more" aria-current="page">/);
 for(const path of ['M3 20V4','m12 2.8 2.8 5.7','m15.8 8.2','M12 2.8v9.2','cx="16.5" cy="12"'])assert.ok(html.includes(path),`Missing planned icon path ${path}`);
 assert.match(css,/@media\(max-width:1099px\)\{\.bottom-nav a\[aria-current="page"\]\{background:transparent\}\}/);
});

test('primary navigation fails closed on wrong tab count or unknown icon',()=>{
 assert.throws(()=>bottomNavMarkup(tabs.slice(0,4),'market'),/exactly five tabs/);
 assert.throws(()=>bottomNavMarkup([...tabs.slice(0,4),{...tabs[4],id:'unknown'}],'market'),/Unknown primary navigation icon/);
});
