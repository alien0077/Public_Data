import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {previewIOSBackup,convertCompatiblePreview} from './import-compat.mjs';

const trade=(extra={})=>({
 id:'123e4567-e89b-12d3-a456-426614174000',
 date:'2026-10-01T00:00:00Z',
 type:'買入',
 shares:10,
 price:500,
 symbol:'2330',
 name:'台積電',
 fee:20,
 tax:0,
 ...extra,
});

test('iOS backup conversion preserves an explicitly recorded ISO currency',async()=>{
 const preview=await previewIOSBackup(JSON.stringify([trade({currency:'TWD'})]));
 assert.equal(preview.trades[0].currency,'TWD');
});

test('iOS backup conversion does not infer a currency missing from legacy trades',async()=>{
 const preview=await previewIOSBackup(JSON.stringify([trade()]));
 assert.equal(Object.hasOwn(preview.trades[0],'currency'),false);
});

test('iOS legacy brokerage rows and annual settlements are included in a Web v2 archive',async()=>{
 const normalizedTrades=Array.from({length:390},(_,index)=>({rawID:`raw-${index+1}`,side:index<313?'買進':'賣出',symbol:'2330',stockName:'台積電',validationError:index<350?'需核對':''}));
 const annualSettledRecords=[{year:2025,symbol:'2330',shares:10}];
 const source=JSON.stringify({version:'1.12',transactions:[trade()],normalizedTrades,annualSettledRecords});
 const preview=await previewIOSBackup(source,{filename:'old-export.json'});
 assert.equal(preview.sourceRecords.normalizedTrades.length,390);
 assert.equal(preview.sourceRecords.annualSettledRecords.length,1);
 const webBackup=await convertCompatiblePreview(preview);
 assert.equal(webBackup.legacySourceRecords.sources.length,1);
 assert.equal(webBackup.legacySourceRecords.sources[0].normalizedTrades[349].validationError,'需核對');
 assert.equal(webBackup.legacySourceRecords.sources[0].annualSettledRecords[0].year,2025);
 assert.equal(Object.hasOwn(webBackup.preferences,'rebuild.legacySourceRecords.v1'),false);
 assert.match(preview.warnings.join(' '),/390 筆券商原始明細與 1 筆年度結算記錄保存於 Web 備份/);
 assert.match(preview.warnings.join(' '),/有 350 筆券商原始交易帶有來源校驗錯誤/);
 assert.match(preview.warnings.join(' '),/不會計入有效持倉或資產數字/);
});

test('trade import checkboxes stay compact and horizontal on mobile',()=>{
 const css=readFileSync(new URL('./style.css',import.meta.url),'utf8');
 assert.match(css,/label:has\(>input\[data-compatible-index\]\)\{display:flex;flex-direction:row/);
 assert.match(css,/label:has\(>input\[data-compatible-index\]\)>input\{width:22px;height:22px/);
});

test('iOS backup rejects malformed supplemental record collections',async()=>{
 await assert.rejects(()=>previewIOSBackup(JSON.stringify({transactions:[trade()],normalizedTrades:{}})),/格式不正確/);
});

test('iOS annual-settlement export also accepts its empty-object representation',async()=>{
 const preview=await previewIOSBackup(JSON.stringify({transactions:[trade()],annualSettledRecords:{},normalizedTrades:[]}));
 assert.deepEqual(preview.sourceRecords.annualSettledRecords,{});
 assert.equal(preview.legacySourceRecords,null);
});

test('rotation sector pagination advances shell and served module/style cache keys',()=>{
 const read=name=>readFileSync(new URL(`./${name}`,import.meta.url),'utf8');
 const index=read('index.html'),app=read('app.mjs'),features=read('features.mjs'),worker=read('sw.js'),transfer=read('transfer.mjs');
 assert.match(index,/app\.mjs\?v=224/);
 assert.match(index,/style\.css\?v=124/);
 assert.match(app,/features\.mjs\?v=132/);
 assert.match(app,/storage\.mjs\?v=3/);
 assert.match(app,/market\.mjs\?v=62/);
 assert.match(app,/explore-market\.mjs\?v=3/);
 assert.match(app,/sw\.js\?v=142/);
 assert.match(app,/transaction-actions\.mjs\?v=1/);
 assert.match(app,/transactionStockActions\(s,stock\.name,/);
 assert.match(app,/comparison\.mjs\?v=2/);
 assert.match(app,/navigation\.mjs\?v=14/);
 assert.match(features,/transfer\.mjs\?v=9/);
 assert.match(features,/services\.mjs\?v=61/);
 assert.match(features,/rotation\.mjs\?v=7/);
 assert.match(worker,/twstock-rebuild-shell-v235/);
 assert.match(app,/market-turnover\.mjs\?v=2/);
 assert.match(worker,/market-turnover\.mjs\?v=2/);
 assert.match(worker,/app\.mjs\?v=224/);
 assert.match(worker,/transaction-actions\.mjs\?v=1/);
 assert.match(worker,/comparison\.mjs\?v=2/);
 assert.match(worker,/market\.mjs\?v=62/);
 assert.match(worker,/explore-market\.mjs\?v=3/);
 assert.match(worker,/\.\/explore-market\.mjs/);
 assert.match(worker,/index-intraday\.mjs\?v=9/);
 assert.match(worker,/features\.mjs\?v=132/);
 assert.match(worker,/rotation\.mjs\?v=7/);
 assert.match(features,/m03-research\.mjs\?v=4/);
 assert.match(worker,/m03-research\.mjs\?v=4/);
 assert.match(features,/etf-battle\.mjs\?v=6/);
 assert.match(worker,/etf-battle\.mjs\?v=6/);
 assert.match(worker,/assets\.mjs\?v=3/);
 assert.match(worker,/explore\.mjs\?v=13/);
 assert.match(worker,/style\.css\?v=124/);
 assert.match(features,/desktop-pages\.mjs\?v=71/);
 assert.match(worker,/desktop-pages\.mjs\?v=71/);
 assert.match(worker,/services\.mjs\?v=61/);
 assert.match(worker,/transfer\.mjs\?v=9/);
 assert.match(worker,/storage\.mjs\?v=3/);
 assert.match(worker,/import-compat\.mjs\?v=3/);
 assert.match(worker,/personal-records\.mjs\?v=2/);
 assert.match(transfer,/compatible\?\.integrity\?\?legacy\?\.integrity\?\?\(pending\?\.checksum\?/);
});
