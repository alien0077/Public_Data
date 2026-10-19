import assert from 'node:assert/strict';
import test from 'node:test';
import {comparisonStockMarkup} from './comparison.mjs';

test('chart comparison exposes the selected real stock link and favorite action',()=>{
 const html=comparisonStockMarkup('2330','台積電 2330',(symbol,name,id)=>`<button data-action="favorite" data-symbol="${symbol}" data-favorite-id="${id}" aria-label="加入自選 ${name}">☆</button>`);
 assert.match(html,/href="#\/security\?symbol=2330"/);
 assert.match(html,/台積電 2330/);
 assert.match(html,/data-action="favorite" data-symbol="2330" data-favorite-id="comparison-2330"/);
 assert.match(html,/aria-label="加入自選 台積電 2330"/);
});

test('comparison identity escapes labels and still works without a favorite provider',()=>{
 const html=comparisonStockMarkup('X&1','<script>台積電</script>');
 assert.match(html,/href="#\/security\?symbol=X%261"/);
 assert.match(html,/&lt;script&gt;台積電&lt;\/script&gt;/);
 assert.doesNotMatch(html,/<script>/);
});
