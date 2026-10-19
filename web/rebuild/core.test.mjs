import test from 'node:test';
import {sortRows,normalizePreference} from './core.mjs';
test('manual watchlist ordering survives preference normalization without mutating rows',()=>{
 const rows=[{symbol:'2330',price:100},{symbol:'2317',price:200}];
 const p=normalizePreference({version:1,fields:['price'],sort:'price',descending:true,manual:true},['price']);
 assert.deepEqual(sortRows(rows,p).map(r=>r.symbol),['2330','2317']);
 assert.deepEqual(sortRows(rows,{...p,manual:false}).map(r=>r.symbol),['2317','2330']);
 assert.deepEqual(rows.map(r=>r.symbol),['2330','2317']);
});
import assert from 'node:assert/strict';
import {favoriteSearchCandidates,rawRow,rawPercent,resolveListingStatus,normalizeTradeRecord,tradeProjection,normalizeFavorites,limitStatus,readChart,readDailyChartSnapshots,loadRecentDailyChart,changeFromRecentRawCloses,withPreviousRawClose,exchangeDateLabel,exchangeClockLabel,updateExchangeClocks,searchDirectoryRows,canonicalUSIndexRows,validPriceReferenceContract,withPriceReference} from './core.mjs';
test('price reference accepts a valid publication cutoff after the latest market day',()=>{
 const raw={id:'2330',date:'2026-10-16',c:100};
 const payload={schemaVersion:1,date:'2026-10-16',cutoff:'2026-10-18',basis:'official_raw_close_minus_signed_change',stocks:{'2330':{symbol:'2330',date:'2026-10-16',close:100,change:2,referencePrice:98}}};
 assert.equal(validPriceReferenceContract(payload,'2026-10-16','2026-10-19'),true);
 assert.equal(withPriceReference(raw,payload,'2026-10-16').referencePrice,98);
});
test('price reference rejects a prior, future, invalid, or mismatched cutoff/date',()=>{
 const payload={schemaVersion:1,date:'2026-10-16',cutoff:'2026-10-18',basis:'official_raw_close_minus_signed_change',stocks:{}};
 for(const cutoff of ['2026-10-15','2026-10-20','2026-02-30','bad'])assert.equal(validPriceReferenceContract({...payload,cutoff},'2026-10-16','2026-10-19'),false,cutoff);
 assert.equal(validPriceReferenceContract(payload,'2026-10-17','2026-10-19'),false);
 assert.equal(validPriceReferenceContract(payload,'2026-10-16','2026-10-17'),false);
});
test('exchange clocks use numeric local dates and times independent of device timezone',()=>{
 const instant=new Date('2026-10-20T15:00:00.000Z');
 assert.equal(exchangeClockLabel(instant,'US'),'美東當地時間 2026-10-20 11:00 ET');
 assert.equal(exchangeClockLabel(instant,'TW'),'台灣當地時間 2026-10-20 23:00');
});
test('exchange clock refresh updates the displayed wall clock without changing its market zone',()=>{
 const node={dataset:{exchangeClock:'US'},textContent:''};
 updateExchangeClocks({querySelectorAll:()=>[node]},new Date('2026-10-20T15:00:00.000Z'));
 assert.equal(node.textContent,'美東當地時間 2026-10-20 11:00 ET');
});
test('exchange date labels retain the market trading date rather than device timezone',()=>{
 assert.equal(exchangeDateLabel('TW','2026-10-16'),'台灣交易日期 2026-10-16');
 assert.equal(exchangeDateLabel('US','2026-10-15'),'美東交易日期 2026-10-15');
 assert.equal(exchangeDateLabel('US','bad'),'美東交易日期 日期不足');
});
test('canonical US daily index cards use exact Public_Data trading dates and adjacent raw closes',()=>{
 const symbols=['^DJI','^IXIC','^GSPC','^SOX','TSM'];
 const rows=canonicalUSIndexRows({stocks:[...symbols.map(id=>({id,date:'2026-10-16',c:120})),{id:'^SOX',date:'2026-10-15',c:999}]},{stocks:symbols.map(id=>({id,date:'2026-10-15',c:100}))},'2026-10-16');
 assert.equal(rows.length,5);
 const sox=rows.find(row=>row.symbol==='^SOX');
 assert.equal(sox.name,'費城半導體指數');assert.equal(sox.market,'US');assert.equal(sox.asOf,'2026-10-16');assert.equal(sox.change,20);assert.equal(sox.changePercent,20);
 assert.deepEqual(canonicalUSIndexRows({stocks:[{id:'^SOX',date:'2026-10-15',c:120}]},null,'2026-10-16'),[],'mismatched source date is not relabeled as current');
});
test('adjusted daily pct never becomes an actual market change',()=>{const r=rawRow({id:'2330',c:100,pct:10,adj_c:200},{name:'台積電'},{},'2026-10-03');assert.equal(r.changePercent,null);assert.equal(r.change,null);assert.equal(r.price,100);assert.equal(rawPercent({c:100,previous_close:90}),null);});
test('favorite autocomplete uses current stock identities, filters by name or symbol, and caps visible choices',()=>{
 const directory=[{symbol:'2330',name:'台積電'},{symbol:'2317',name:'鴻海'},{symbol:'0050',name:'元大台灣50'},{symbol:'0051',name:'元大中型100'}];
 assert.deepEqual(favoriteSearchCandidates(directory,'台積').rows.map(row=>row.symbol),['2330']);
 assert.deepEqual(favoriteSearchCandidates(directory,'2317').rows.map(row=>row.name),['鴻海']);
 const results=favoriteSearchCandidates(directory,'005',[],1);assert.equal(results.total,2);assert.deepEqual(results.rows.map(row=>row.symbol),['0050']);
 assert.deepEqual(favoriteSearchCandidates(directory,'台積',['2330']).rows,[]);
 assert.equal(favoriteSearchCandidates(directory,'').total,0);
});
test('exchange reference alone yields raw same-scale percent',()=>{assert.ok(Math.abs(rawPercent({c:110,referencePrice:100})-10)<1e-10);for(const x of [0,-1,null,undefined])assert.equal(rawPercent({c:110,referencePrice:x}),null);});
test('expired, unknown and delisted listing evidence fail closed',()=>{const s={cutoff:'2026-10-03',validThrough:'2026-10-03',stocks:{'2330':{status:'LISTED',eligible:true},'1111':{status:'DELISTED',eligible:false}}};assert.equal(resolveListingStatus('2330','2026-10-03',s).eligible,true);assert.equal(resolveListingStatus('2330','2026-10-04',s).eligible,false);assert.equal(resolveListingStatus('missing','2026-10-03',s).eligible,false);assert.equal(resolveListingStatus('1111','2026-10-03',s).eligible,false);});
test('search directory includes every current Public_Data security without inventing missing quotes',()=>{
 const cutoff='2026-10-19',listing={cutoff,validThrough:cutoff,stocks:{
  '2330':{status:'LISTED',eligible:true,market:'TWSE',securityType:'equity'},
  '2317':{status:'LISTED',eligible:true,market:'TWSE',securityType:'equity'},
  '0050':{status:'LISTED',eligible:true,market:'TWSE',securityType:'fund'},
  '9999':{status:'DELISTED',eligible:false,market:'TWSE',securityType:'equity'}
 }};
 const metadata={stocks:[{symbol:'2330',name:'台積電',official_sector:'半導體業'},{symbol:'2317',name:'鴻海',official_sector:'電子工業'},{symbol:'0050',name:'元大台灣50',official_sector:'ETF'}]};
 const rows=searchDirectoryRows([{symbol:'2330',name:'台積電',price:100,asOf:cutoff}],metadata,listing,cutoff);
 assert.deepEqual(rows.map(row=>row.symbol).sort(),['0050','2317','2330']);
 assert.equal(rows.find(row=>row.symbol==='2317').name,'鴻海');
 assert.equal(rows.find(row=>row.symbol==='2317').price,null);
 assert.equal(rows.find(row=>row.symbol==='0050').securityType,'fund');
 assert.equal(searchDirectoryRows([],metadata,listing,'2026-10-20').length,3,'a supplied current stocks.json universe supersedes the stale sidecar for current search candidates');
});
test('search directory follows stocks.json additions even when the fresh listing sidecar omits them',()=>{
 const cutoff='2026-10-19',listing={cutoff,validThrough:cutoff,stocks:{'2330':{status:'LISTED',eligible:true,market:'TWSE',securityType:'equity'}}};
 const metadata={stocks:[{symbol:'2330',name:'台積電',market:'TWSE',official_sector:'半導體業'},{symbol:'4804',name:'大略-KY',market:'TWSE',official_sector:'生技醫療'}]};
 const rows=searchDirectoryRows([{id:'2330',name:'台積電',price:100},{id:'4804',price:42}],metadata,listing,cutoff);
 assert.deepEqual(rows.map(row=>row.symbol).sort(),['2330','4804']);
 assert.equal(rows.find(row=>row.symbol==='4804').name,'大略-KY');
 assert.equal(rows.find(row=>row.symbol==='4804').price,42);
 const metadataOnly=searchDirectoryRows([],metadata,listing,cutoff);
 assert.equal(metadataOnly.find(row=>row.symbol==='4804').price,null);
 assert.equal(metadataOnly.find(row=>row.symbol==='4804').securityType,'equity');
});
test('price limits require explicit positive reference and bands',()=>{assert.equal(limitStatus({price:110,referencePrice:100,limitUp:110}),'漲停');assert.equal(limitStatus({price:90,referencePrice:100,limitDown:90}),'跌停');assert.equal(limitStatus({price:110,referencePrice:0,limitUp:110}),null);assert.equal(limitStatus({price:110,referencePrice:100}),null);});
test('FIFO projection preserves fee-inclusive lot cost',()=>{const trades=[{symbol:'2330',stockName:'台積電',side:'買進',quantity:10,price:100,fee:1,tax:0,tradeDate:'2026-01-01'},{symbol:'2330',side:'賣出',quantity:4,price:120,fee:1,tax:1,tradeDate:'2026-02-01'}];assert.equal(normalizeTradeRecord(trades[0]).valid,true);const p=tradeProjection(trades,[{symbol:'2330',price:110}]);assert.equal(p.rows[0].shares,6);assert.ok(Math.abs(p.rows[0].cost-100.1)<1e-9);assert.equal(p.issues.length,0);assert.equal(tradeProjection([...trades,{side:'配息'}],[]).issues.length,1);});
test('favorites reject unsupported shape and avoid prototype mutation',()=>{assert.throws(()=>normalizeFavorites({bad:42}));const groups=normalizeFavorites(JSON.parse('{"__proto__":["2330"]}'));assert.equal(Object.getPrototypeOf(groups),null);assert.deepEqual(groups.__proto__,['2330']);});
test('chart rejects unaligned OHLCV and retains date alignment',()=>{assert.throws(()=>readChart({timestamp:[1],open:[]}));const r=readChart({schemaVersion:2,symbol:'2330',source:'data.daily.tw.raw_ohlcv',priceBasis:'raw',sourceManifestSHA256:'a'.repeat(64),dataQuality:'explicit_rejected_dates_v1',rejectedDates:[],timestamp:[2,1],open:[3,2],high:[4,3],low:[2,1],close:[3,2],volume:[20,10]});assert.equal(r[0].time,1);assert.equal(r[0].volume,10);});
test('chart rejection dates require canonical producer evidence and restart RSI',()=>{const date=d=>Date.parse(`2026-01-${String(d).padStart(2,'0')}T00:00:00Z`)/1000;const dates=Array.from({length:31},(_,i)=>i+1).filter(d=>d!==10);const p={schemaVersion:2,symbol:'2330',source:'data.daily.tw.raw_ohlcv',priceBasis:'raw',sourceManifestSHA256:'a'.repeat(64),dataQuality:'explicit_rejected_dates_v1',rejectedDates:['2026-01-10'],timestamp:dates.map(date),open:Array(30).fill(10),high:Array(30).fill(11),low:Array(30).fill(9),close:Array(30).fill(10),volume:Array(30).fill(1),rsi14:Array(30).fill(50)};const rows=readChart(p);assert.equal(rows[8].gapBefore,false);assert.equal(rows[9].gapBefore,true);assert.equal(rows[9].rsi14,null);assert.equal(rows[22].rsi14,null);assert.equal(rows[23].rsi14,50);assert.throws(()=>readChart({...p,rejectedDates:['2026-02-31']}),/拒收日期格式/);assert.throws(()=>readChart({...p,dataQuality:undefined}),/拒收日期證據/);});
import {normalizedInstitutional,flowSeries,median} from './research.mjs';
test('institutional tracking lots and rapid shares normalize independently',()=>{const raw={accumulated_inst_buy:50,total_inst_buy:50000,tracking_days:12,buy_days:3,daily_inst_flow:[{date:'2026-01-01',value:1000}]};assert.equal(normalizedInstitutional([raw])[0].institutionalNet,50);assert.equal(normalizedInstitutional([raw],true)[0].institutionalNet,50);assert.equal(normalizedInstitutional([raw],true)[0].flow[0].value,1);assert.equal(normalizedInstitutional([raw])[0].trackingDays,12);assert.equal(normalizedInstitutional([raw])[0].buyDays,null);});
test('research flow date filter and median reject invalid PE',()=>{assert.deepEqual(flowSeries([{flow:[{date:'2026-01-01',value:2},{date:'2026-01-02',value:3}]}],'2026-01-02'),[{date:'2026-01-02',value:3}]);assert.equal(median([null,-1,0,10,20]),15);});
import {etfPerformanceView,rebalanceEntries} from './research.mjs';
test('ETF performance preserves source scale and explicit dates',()=>{const p=etfPerformanceView({etfs:[{etf_id:'0050',first_date:'2026-01-02',latest_date:'2026-09-18',return_price_basis:'adjusted_close',return_pct:20,first_close:100,latest_close:40}]},'0050');assert.equal(p.returnValue,20);assert.equal(p.basis,'還原收盤價報酬');assert.equal(p.datesValid,true);assert.equal(etfPerformanceView({etfs:[]},'0050'),null);});
test('ETF rebalance preserves percentage point differences without invented dates',()=>{const rows=rebalanceEntries({added:['2330'],weight_down:[{stock_id:'2317',diff:-.69}]});assert.equal(rows[0].diff,null);assert.equal(rows[1].diff,-.69);assert.equal(rows[1].label,'權重減少');assert.equal('date' in rows[1],false);});


test('recent canonical daily chart uses only raw OHLCV and marks missing trading dates as gaps',()=>{
 const snapshot=(date,stocks)=>({date,stocks});
 const result=readDailyChartSnapshots('2330',['2026-10-01','2026-10-02','2026-10-05'],[
  snapshot('2026-10-01',[{id:'2330',date:'2026-10-01',o:100,h:110,l:99,c:108,v:1000,adj_c:10}]),
  snapshot('2026-10-02',[]),
  snapshot('2026-10-05',[{id:'2330',date:'2026-10-05',o:108,h:112,l:106,c:111,v:1200,adj_c:11}])
 ]);
 assert.deepEqual(result.rows.map(row=>[row.date,row.open,row.high,row.low,row.close,row.volume,row.gapBefore]),[
  ['2026-10-01',100,110,99,108,1000,false],['2026-10-05',108,112,106,111,1200,true]
 ]);
 assert.deepEqual(result.missingDates,['2026-10-02']);
 assert.equal('adj_close' in result.rows[0],false);
});
test('recent canonical daily chart rejects mismatched source dates and malformed OHLCV',()=>{
 assert.throws(()=>readDailyChartSnapshots('2330',['2026-10-01'],[{date:'2026-10-02',stocks:[]}]),/日期或結構無效/);
 assert.throws(()=>readDailyChartSnapshots('2330',['2026-10-01'],[{date:'2026-10-01',stocks:[{id:'2330',date:'2026-10-01',o:100,h:90,l:95,c:99,v:1}]}]),/沒有有效/);
});


test('recent daily chart loads at most the indexed last 30 days and reuses snapshots across securities',async()=>{
 const dates=['2026-08-31','2026-09-02','2026-10-01','2026-10-02'];let calls=0;
 const index={latest_daily_tw:'2026-10-02',available_days_tw:dates};
 const fetchData=async path=>{calls++;const date=path.match(/\d{4}-\d{2}-\d{2}/)[0];return {date,stocks:[{id:'2330',date,o:10,h:11,l:9,c:10,v:100},{id:'0050',date,o:50,h:51,l:49,c:50,v:200}]};};
 const a=await loadRecentDailyChart('2330',index,fetchData);assert.deepEqual(a.requestedDates,['2026-09-02','2026-10-01','2026-10-02']);assert.equal(a.rows.length,3);assert.equal(calls,3);
 const b=await loadRecentDailyChart('0050',index,fetchData);assert.equal(b.rows.length,3);assert.equal(calls,3);
});

test('daily raw-close change requires the current latest session and an unbroken prior session',()=>{
 const row={price:111,asOf:'2026-10-05'};
 const chart={rows:[{date:'2026-10-02',close:108,gapBefore:false},{date:'2026-10-05',close:111,gapBefore:false}],observedDates:['2026-10-02','2026-10-05']};
 assert.deepEqual(changeFromRecentRawCloses(row,{latest_daily_tw:'2026-10-05'},chart),{change:3,changePercent:3/108*100,referencePrice:108,referenceDate:'2026-10-02'});
 assert.equal(changeFromRecentRawCloses(row,{latest_daily_tw:'2026-10-05'},{...chart,rows:[chart.rows[0],{...chart.rows[1],gapBefore:true}]}),null);
 assert.equal(changeFromRecentRawCloses({...row,asOf:'2026-10-02'},{latest_daily_tw:'2026-10-05'},chart),null);
 assert.equal(changeFromRecentRawCloses({...row,price:110},{latest_daily_tw:'2026-10-05'},chart),null);
});

test('recent raw daily reads cap concurrent GitHub Raw requests at four',async()=>{
 const dates=Array.from({length:9},(_,i)=>`2026-09-${String(i+20).padStart(2,'0')}`);let active=0,maximum=0,calls=0;
 const fetchData=async path=>{active++;calls++;maximum=Math.max(maximum,active);await new Promise(resolve=>setTimeout(resolve,2));active--;const date=path.match(/\d{4}-\d{2}-\d{2}/)[0];return {date,stocks:[{id:'2330',date,o:10,h:11,l:9,c:10,v:100}]};};
 const result=await loadRecentDailyChart('2330',{latest_daily_tw:'2026-10-09',available_days_tw:dates},fetchData);
 assert.equal(result.rows.length,9);assert.equal(calls,9);assert.equal(maximum,4);
});


test('daily movement uses adjacent source-dated raw closes and preserves source gaps',()=>{
 const row={symbol:'2330',price:105,asOf:'2026-10-14',change:null,changePercent:null};
 const current={date:'2026-10-14',stocks:[{id:'2330',date:'2026-10-14',c:105}]},previous={date:'2026-10-13',stocks:[{id:'2330',date:'2026-10-13',c:100}]};
 const result=withPreviousRawClose(row,current,previous,'2026-10-14','2026-10-13');assert.equal(result.change,5);assert.equal(result.changePercent,5);assert.equal(result.referencePrice,100);assert.equal(result.referenceDate,'2026-10-13');
 assert.equal(withPreviousRawClose(row,{...current,date:'2026-10-13'},previous,'2026-10-14','2026-10-13').change,null);
 assert.equal(withPreviousRawClose({...row,price:106},current,previous,'2026-10-14','2026-10-13').change,null);
 assert.equal(withPreviousRawClose(row,current,{...previous,stocks:[]},'2026-10-14','2026-10-13').change,null);
 assert.equal(withPreviousRawClose(row,{...current,stocks:[...current.stocks,...current.stocks]},previous,'2026-10-14','2026-10-13').change,null);
});
