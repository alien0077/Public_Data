import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const app=await readFile(new URL('./app.mjs',import.meta.url),'utf8');
const transfer=await readFile(new URL('./transfer.mjs',import.meta.url),'utf8');
const css=await readFile(new URL('./style.css',import.meta.url),'utf8');

test('手機股票清單以十檔為一頁並提供前後頁切換',()=>{
 assert.match(app,/const pageSize=10,paged=/);
 assert.match(app,/data-action="list-page-prev" disabled>上一頁/);
 assert.match(app,/data-action="list-page-next">下十檔/);
 assert.match(app,/action==='list-page-prev'\|\|action==='list-page-next'/);
 assert.match(app,/page\*size\+1/);
});

test('自選星號切換後保留手機股票清單目前頁碼',()=>{
 assert.match(app,/function setListPage\(host,page\)/);
 assert.match(app,/const currentList=button\.closest\('\.rows\[data-list-paged\]'\),currentPage=Number\(currentList\?\.dataset\.listPage\)\|\|0/);
 assert.match(app,/if\(currentPage>0\)\{const updatedList=document\.querySelector\('#main \.rows\[data-list-paged\]'\);if\(updatedList\)setListPage\(updatedList,currentPage\);\}/);
});

test('手機卡片清單以十項為一頁並有頁碼與上一頁控制',()=>{
 assert.match(app,/const pageSize=10;/);
 assert.match(app,/data-action="mobile-page-prev" disabled>上一頁/);
 assert.match(app,/data-action="mobile-page-next"/);
 assert.match(app,/action==='mobile-page-prev'\|\|action==='mobile-page-next'/);
 assert.match(app,/host\.querySelector\('\.mobile-page-pagination'\)/);
 assert.match(app,/第 \$\{page\+1\} 頁/);
});

test('M21 匯入結果交易清單套用共用十項卡片分頁',()=>{
 assert.match(transfer,/article class="card transfer-result-row"/);
 assert.ok(transfer.includes('class="transfer-result-list">${rows}</div>'));
});

test('分頁控制在手機可觸及，桌面隱藏',()=>{
 assert.match(css,/\.mobile-list-pagination button\{[^}]*min-height:44px/);
 assert.match(css,/@media\(min-width:1100px\)\{\.mobile-list-pagination\{display:none\}\}/);
});
