import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeLegacyFavoritesPayload,mergeFavoriteGroups} from './storage.mjs';

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
