import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseThemeGroup,filterThemeGroups} from './theme-tabs.mjs';

const sectors=[
 {sector_tag:'semiconductor',display_tag:'半導體',stock_count:2,stocks:[{stock_id:'2330',name:'台積電'},{stock_id:'2454',name:'聯發科'}]},
 {sector_tag:'shipping',display_tag:'航運',stock_count:1,stocks:[{stock_id:'2603',name:'長榮'}]}
];

test('theme search returns matching group and stock members only',()=>{
 const result=filterThemeGroups(sectors,'聯發科',()=>true);
 assert.equal(result.length,1);
 assert.equal(result[0].group.sector_tag,'semiconductor');
 assert.deepEqual(result[0].members.map(row=>row.stock_id),['2454']);
});

test('theme page selection keeps one group and falls back when search removes it',()=>{
 const groups=filterThemeGroups(sectors,'',()=>true);
 assert.equal(chooseThemeGroup(groups,'shipping').group.sector_tag,'shipping');
 const filtered=filterThemeGroups(sectors,'半導體',()=>true);
 assert.equal(chooseThemeGroup(filtered,'shipping').group.sector_tag,'semiconductor');
 assert.equal(chooseThemeGroup([],''),null);
});

test('ineligible securities do not appear in theme group choices',()=>{
 const result=filterThemeGroups(sectors,'',symbol=>symbol!=='2454');
 assert.equal(result[0].members.length,1);
 assert.equal(result[0].members[0].stock_id,'2330');
});
