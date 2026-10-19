import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {canonicalJSON,favorites,normalizeLegacyFavoritesPayload,mergeFavoriteGroups,mergeLegacySourceRecords,verifyBackup,previewLegacyBackup} from './storage.mjs';

async function backupWithTradeCurrency(currency){
 const trade={id:'trade-1',date:'2026-10-01',type:'買入',symbol:'2330',name:'台積電',shares:1,price:500,fee:0,tax:0};
 if(currency!==undefined)trade.currency=currency;
 const body={version:2,platform:'web',createdAt:'2026-10-16T00:00:00.000Z',trades:[trade],favorites:{},favoriteCategoryOrder:[],preferences:{}};
 const bytes=new TextEncoder().encode(canonicalJSON(body));
 const checksum=Buffer.from(await webcrypto.subtle.digest('SHA-256',bytes)).toString('hex');
 return {...body,checksum};
}

test('backup validation accepts explicit ISO currency and legacy absence, rejects malformed currency',async()=>{
 assert.equal((await verifyBackup(await backupWithTradeCurrency('TWD'))).trades[0].currency,'TWD');
 assert.equal(Object.hasOwn((await verifyBackup(await backupWithTradeCurrency(undefined))).trades[0],'currency'),false);
 await assert.rejects(async()=>verifyBackup(await backupWithTradeCurrency('USDT')),/幣別格式不正確/);
});

test('Web v2 checksum covers archived old-app source records',async()=>{
 const body={version:2,platform:'web',createdAt:'2026-10-16T00:00:00.000Z',trades:[],favorites:{},favoriteCategoryOrder:[],preferences:{},legacySourceRecords:{schemaVersion:1,sources:[{sourceHash:'a'.repeat(64),filename:'old.json',importedAt:'2026-10-16T00:00:00.000Z',normalizedTrades:[{rawID:'raw-1'}],annualSettledRecords:[]}]}};
 const bytes=new TextEncoder().encode(canonicalJSON(body));
 const checksum=Buffer.from(await webcrypto.subtle.digest('SHA-256',bytes)).toString('hex');
 const verified=await verifyBackup({...body,checksum});
 assert.equal(verified.legacySourceRecords.sources[0].normalizedTrades.length,1);
 await assert.rejects(()=>verifyBackup({...body,legacySourceRecords:{...body.legacySourceRecords,sources:[{...body.legacySourceRecords.sources[0],normalizedTrades:[{rawID:'tampered'}]}]},checksum}),/checksum 不一致/);
});

test('supplemental source archive merges idempotently and rejects source-hash conflicts',()=>{
 const source={sourceHash:'b'.repeat(64),filename:'old.json',importedAt:'2026-10-16T00:00:00.000Z',normalizedTrades:[{rawID:'raw-1'}],annualSettledRecords:[]};
 const first=mergeLegacySourceRecords(null,{schemaVersion:1,sources:[source]});
 assert.deepEqual(mergeLegacySourceRecords(first,{schemaVersion:1,sources:[{...source,filename:'renamed.json'}]}),first);
 assert.throws(()=>mergeLegacySourceRecords(first,{schemaVersion:1,sources:[{...source,normalizedTrades:[{rawID:'different'}]}]}),/同一來源 SHA-256/);
});

test('new Web watchlists start empty and do not surface saved legacy defaults',()=>{
 const previous=globalThis.localStorage;
 const values=new Map([['twstock_favorite_data',JSON.stringify({'我的最愛':['2330','2317'],'觀察中':['0050']})]]);
 globalThis.localStorage={getItem:key=>values.has(key)?values.get(key):null};
 try{
  assert.deepEqual(favorites(),{});
  assert.equal(values.has('twstock_favorite_data'),true);
 }finally{
  if(previous===undefined)delete globalThis.localStorage;
  else globalThis.localStorage=previous;
 }
});

test('legacy favorite migration preserves category order and empty categories',()=>{
 const value=normalizeLegacyFavoritesPayload(
  JSON.stringify({'自選':['2330'],'觀察中':['2317']}),
  JSON.stringify(['觀察中','定存股','自選'])
 );
 assert.deepEqual(Object.keys(value),['觀察中','定存股','自選']);
 assert.deepEqual(value['觀察中'],['2317']);
 assert.deepEqual(value['定存股'],[]);
 assert.deepEqual(value['自選'],['2330']);
});

test('category-only legacy data migrates as ordered empty groups',()=>{
 const value=normalizeLegacyFavoritesPayload(null,JSON.stringify(['觀察中','定存股']));
 assert.deepEqual(Object.keys(value),['觀察中','定存股']);
 assert.deepEqual(value['觀察中'],[]);
 assert.deepEqual(value['定存股'],[]);
});

test('legacy data groups absent from the category list remain appended',()=>{
 const value=normalizeLegacyFavoritesPayload(
  JSON.stringify({'自選':['2330'],'舊分類':['2317']}),
  JSON.stringify(['自選'])
 );
 assert.deepEqual(Object.keys(value),['自選','舊分類']);
 assert.deepEqual(value['舊分類'],['2317']);
});

test('malformed or duplicate category metadata fails closed',()=>{
 for(const categories of ['{}','["自選","自選"]','[""]']){
  assert.throws(()=>normalizeLegacyFavoritesPayload('{}',categories),/分類名稱清單格式不正確/);
 }
 assert.throws(()=>normalizeLegacyFavoritesPayload('{"__proto__":["2330"]}',null),/自選分類或證券代號格式不正確/);
 assert.throws(()=>normalizeLegacyFavoritesPayload('not-json',null));
});

test('backup merge preserves explicit imported category order after checksum canonicalization',()=>{
 const groups=mergeFavoriteGroups({}, {'自選':['2330'],'觀察中':['2317'],'空分類':[]}, ['觀察中','空分類','自選']);
 assert.deepEqual(Object.keys(groups),['觀察中','空分類','自選']);
 assert.deepEqual(groups['觀察中'],['2317']);
 assert.deepEqual(groups['空分類'],[]);
});

test('backup merge retains local category order and appends new imported groups in saved order',()=>{
 const groups=mergeFavoriteGroups({'本機順序':['0050'],'既有':['2330']}, {'既有':['2317'],'匯入甲':['2603'],'匯入乙':[]}, ['匯入乙','既有','匯入甲']);
 assert.deepEqual(Object.keys(groups),['本機順序','既有','匯入乙','匯入甲']);
 assert.deepEqual(groups['既有'],['2330','2317']);
});

test('malformed backup category order is rejected instead of silently reordered',()=>{
 assert.throws(()=>mergeFavoriteGroups({}, {'甲':[],'乙':[]}, ['甲','甲']),/分類順序與分類資料不一致/);
 assert.throws(()=>mergeFavoriteGroups({}, {'甲':[],'乙':[]}, ['甲']),/分類順序與分類資料不一致/);
});

test('legacy Web v1 validates its trade checksum and rejects modified records',async()=>{
 const body={version:1,trades:[{id:'QA-M21-V1-LEGACY-001',date:'2026-10-16',type:'買入',shares:1,price:100,symbol:'2330',name:'台積電',fee:1,tax:0}],preferences:{}};
 const checksum=Buffer.from(await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(body)))).toString('hex');
 const archive={...body,platform:'web',createdAt:'2026-10-16T00:00:00Z',favorites:{'QA未驗證分類':['2330']},checksum};
 const preview=await previewLegacyBackup(archive);
 assert.equal(preview.integrity,'LEGACY_PARTIAL_CHECKSUM');
 assert.equal(preview.tradeCount,1);
 assert.equal(preview.warning.includes('自選未受 checksum 保護'),true);
 await assert.rejects(()=>previewLegacyBackup({...archive,trades:[{...archive.trades[0],shares:9}]}),/舊版交易 checksum 不一致/);
});
