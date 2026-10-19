import test from 'node:test';
import assert from 'node:assert/strict';
import {heatmapGroups,heatmapStockTile} from './heatmap.mjs';

const rows=[
 {symbol:'2330',name:'台積電',market:'TWSE',securityType:'equity',industry:'半導體業',turnover:300,changePercent:-1},
 {symbol:'6488',name:'環球晶',market:'TPEX',securityType:'equity',industry:'半導體業',turnover:200,changePercent:2},
 {symbol:'4966',name:'譜瑞-KY',market:'TPEX',securityType:'equity',industry:'半導體業',turnover:100,changePercent:0},
 {symbol:'0050',name:'元大台灣50',market:'TWSE',securityType:'fund',industry:'ETF',sector:'ETF',turnover:500,changePercent:1}
];

const symbols=market=>heatmapGroups(rows,market).flatMap(group=>group.rows.map(row=>row.symbol)).sort();

test('heatmap market scope filters exchange before grouping and excludes ETF',()=>{
 assert.deepEqual(symbols('TWSE'),['2330']);
 assert.deepEqual(symbols('TPEX'),['4966','6488']);
 assert.deepEqual(symbols('all'),['2330','4966','6488']);
});

test('every heatmap stock tile has independent detail and favorite actions',()=>{
 const row={symbol:'2330',name:'台積電',changePercent:1.25};
 const html=heatmapStockTile(row,0,0,90,60,(symbol,name,id)=>`<button class="star" data-action="favorite" data-symbol="${symbol}" data-favorite-id="${id}" aria-label="加入自選 ${name} ${symbol}">☆</button>`);
 assert.match(html,/<a href="#\/security\?symbol=2330"/);
 assert.match(html,/<button class="star" data-action="favorite" data-symbol="2330"/);
 assert.match(html,/data-favorite-id="heatmap-2330"/);
 assert.match(html,/台積電 2330/);
});
