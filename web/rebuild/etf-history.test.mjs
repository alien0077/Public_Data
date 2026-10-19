import test from 'node:test';
import assert from 'node:assert/strict';
import {availableETFHistoryRanges,decodeETFNavHistory,decodeETFRawHistory,filterETFHistoryRange} from './etf-history.mjs';
function payload(days){const start=Date.UTC(2025,0,1)/1000;return{schemaVersion:2,symbol:'00679B',source:'data.daily.tw.raw_ohlcv',priceBasis:'raw',sourceManifestSHA256:'a'.repeat(64),dataQuality:'explicit_rejected_dates_v1',timestamp:Array.from({length:days},(_,i)=>start+i*86400),open:Array.from({length:days},(_,i)=>20+i/100),high:Array.from({length:days},(_,i)=>20.5+i/100),low:Array.from({length:days},(_,i)=>19.5+i/100),close:Array.from({length:days},(_,i)=>20+i/100),volume:Array(days).fill(100)};}
function navPayload(points){const rows=points.map(point=>({...point,retrievedAt:'2026-10-18T22:00:00+08:00',sourcePayloadSHA256:'c'.repeat(64)}));return{schemaVersion:1,symbol:'00679B',market:'TPEX',unit:'TWD_per_unit',source:'tpex.info.etfProduct.netPrice',sourceURL:'https://info.tpex.org.tw/api/etfProduct?lang=zh-tw&query=00679B',dateSemantics:'Taipei exchange trading date',updatedAt:'2026-10-18T22:00:00+08:00',latestDate:points.at(-1)?.date,firstDate:points[0]?.date,pointCount:points.length,latestSourcePayloadSHA256:rows.at(-1)?.sourcePayloadSHA256,points:rows};}
function mopsNavPayload(symbol,points,currency='TWD'){const rows=points.map(point=>({...point,currency:point.currency??currency,retrievedAt:'2026-10-18T22:00:00+08:00',sourcePayloadSHA256:'d'.repeat(64)}));return{...navPayload(points),symbol,market:'TWSE',currency,unit:`${currency}_per_unit`,source:'mops.twse.etf.netAssetValue',sourceURL:'https://mopsov.twse.com.tw/mops/web/t78sb35_new',latestSourcePayloadSHA256:rows.at(-1)?.sourcePayloadSHA256,points:rows};}
test('ETF raw chart requires canonical identity, raw basis and aligned valid OHLCV',()=>{
 const rows=decodeETFRawHistory(payload(300),'00679B');assert.equal(rows.length,300);assert.equal(rows[0].date,'2025-01-01');
 const bad=payload(2);bad.priceBasis='adjusted';assert.throws(()=>decodeETFRawHistory(bad,'00679B'),/契約不符/);
 const malformed=payload(2);malformed.high[1]=1;assert.throws(()=>decodeETFRawHistory(malformed,'00679B'),/無效/);
 const duplicate=payload(2);duplicate.timestamp[1]=duplicate.timestamp[0];assert.throws(()=>decodeETFRawHistory(duplicate,'00679B'),/無效/);
});
test('ETF history only enables ranges covered by canonical raw series',()=>{
 const oneYear=decodeETFRawHistory(payload(420),'00679B'),short=decodeETFRawHistory(payload(100),'00679B');
 assert.deepEqual(availableETFHistoryRanges(oneYear).map(x=>x[1]),['1年','全部']);
 assert.deepEqual(availableETFHistoryRanges(short).map(x=>x[1]),['全部']);
 assert.equal(filterETFHistoryRange(oneYear,'oneYear').length,366);
 assert.equal(filterETFHistoryRange(oneYear,'all').length,420);
});
test('TPEx ETF NAV requires official source lineage, valid dates and positive values',()=>{
 const rows=decodeETFNavHistory(navPayload([{date:'2026-10-14',value:25.19},{date:'2026-10-15',value:25.7411}]),'00679B');
 assert.equal(rows.length,2);assert.equal(rows.at(-1).time,Date.UTC(2026,9,15)/1000);
 const wrong=navPayload([{date:'2026-10-14',value:25.19}]);wrong.source='market.close';assert.throws(()=>decodeETFNavHistory(wrong,'00679B'),/契約不符/);
 const invalid=navPayload([{date:'2026-10-14',value:0}]);assert.throws(()=>decodeETFNavHistory(invalid,'00679B'),/無效/);
 const duplicate=navPayload([{date:'2026-10-14',value:25},{date:'2026-10-14',value:26}]);assert.throws(()=>decodeETFNavHistory(duplicate,'00679B'),/無效/);
});
test('TWSE ETF NAV accepts only MOPS category reports with official lineage',()=>{
 const rows=decodeETFNavHistory(mopsNavPayload('0050',[{date:'2026-10-15',value:108.2},{date:'2026-10-16',value:109}]),'0050');
 assert.equal(rows.at(-1).value,109);
 const wrong=mopsNavPayload('0050',[{date:'2026-10-16',value:109}]);wrong.sourceURL='https://mopsov.twse.com.tw/mops/web/t78sb01_q1';assert.throws(()=>decodeETFNavHistory(wrong,'0050'),/契約不符/);
});
test('MOPS ETF NAV preserves official foreign currency and rejects mixed-currency points',()=>{
 const rows=decodeETFNavHistory(mopsNavPayload('0050',[{date:'2026-10-16',value:31.25}],'USD'),'0050');
 assert.equal(rows[0].currency,'USD');
 const mixed=mopsNavPayload('0050',[{date:'2026-10-15',value:31,currency:'TWD'},{date:'2026-10-16',value:31.25,currency:'USD'}],'USD');
 assert.throws(()=>decodeETFNavHistory(mixed,'0050'),/資料無效/);
});
