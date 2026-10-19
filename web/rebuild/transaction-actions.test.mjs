import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transactionStockActions} from './transaction-actions.mjs';

test('交易紀錄中的個股列可開啟個股頁並加入自選',()=>{
 const html=transactionStockActions('2330','台積電','transaction-trade-1',(symbol,name,id)=>`<button data-action="favorite" data-symbol="${symbol}" data-favorite-id="${id}" aria-label="加入自選 ${name} ${symbol}">☆</button>`);
 assert.match(html,/href="#\/security\?symbol=2330" aria-label="查看個股：台積電 2330"/);
 assert.match(html,/data-action="favorite" data-symbol="2330" data-favorite-id="transaction-trade-1"/);
 assert.match(html,/aria-label="加入自選 台積電 2330"/);
});

test('交易股票資訊會跳脫標記且缺少代號時不建立假股票控制項',()=>{
 const html=transactionStockActions('A&B','<script>x</script>','transaction-1',()=>'<button>☆</button>');
 assert.match(html,/A&amp;B/);
 assert.match(html,/&lt;script&gt;x&lt;\/script&gt;/);
 assert.equal(transactionStockActions('', '未知股票','transaction-empty',()=>'<button>☆</button>'),'');
});

test('備份自選與交易預覽使用共用個股詳情及收藏操作',()=>{
 const transfer=readFileSync(new URL('./transfer.mjs',import.meta.url),'utf8');
 assert.match(transfer,/import \{transactionStockActions\} from '\.\/transaction-actions\.mjs\?v=1'/);
 assert.equal((transfer.match(/transactionStockActions\(/g)||[]).length,3);
 assert.match(transfer,/transfer-result-\$\{index\}-\$\{stock\.symbol\}/);
 assert.match(transfer,/transfer-favorite-\$\{group\}-\$\{index\}-\$\{stock\.symbol\}/);
 assert.match(transfer,/transfer-preview-\$\{i\}-\$\{stock\.symbol\}/);
 assert.doesNotMatch(transfer,/href="#\/security\?symbol=/);
});
