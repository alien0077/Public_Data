import test from 'node:test';
import assert from 'node:assert/strict';
import {createETFUnitFlows,fundDisclosure,fundSnapshotDate,validQuarterlyETFReport,quarterlyETFDisclosure} from './etf.mjs';
import {taipeiDay} from './core.mjs';

test('ETF holdings are complete only with dated explicit full-source proof',()=>{
 const verified={data_mode:'full_holdings',holdings_verified_complete:true,holdings_as_of:'2026-10-14',holdings_source:'issuer report',holdings_origin:'REUSED_PRIOR_SNAPSHOT',holdings_retrieved_at:'2026-10-15T01:00:00Z',holdings_reused_at:'2026-10-15T01:05:00Z'};
 const value=fundDisclosure(verified);assert.equal(value.complete,true);assert.equal(value.date,'2026-10-14');assert.equal(value.origin,'沿用前次快照・非本次更新');assert.equal(value.reusedAt,verified.holdings_reused_at);
 for(const patch of [{holdings_verified_complete:false},{data_mode:'partial_holdings'},{holdings_as_of:null},{holdings_source:''}])assert.equal(fundDisclosure({...verified,...patch}).complete,false);
});

test('ETF snapshot dates reject malformed and future dates without inventing provenance',()=>{
 const future=new Date(`${taipeiDay()}T00:00:00Z`);future.setUTCDate(future.getUTCDate()+1);const futureDate=future.toISOString().slice(0,10);
 assert.equal(fundSnapshotDate({as_of:'2026-02-30',date:'2026-10-14'}),'2026-10-14');
 assert.equal(fundSnapshotDate({as_of:futureDate}),null);
 assert.equal(fundSnapshotDate({as_of:'not-a-date',date:'2026-10-14'}),'2026-10-14');
 assert.equal(fundDisclosure({holdings_as_of:futureDate,holdings_source:'issuer',data_mode:'full_holdings',holdings_verified_complete:true}).complete,false);
});

const monthlyFixture=()=>({schemaVersion:1,period:'2026-09',periodSemantics:'as_of_last_business_day_of_month',reportDateROC:'115/09',unitLabel:'張數',issuedUnitsField:'發行單位數(張數)',tradedUnitsField:'成交單位數(張數)',generatedAt:'2026-10-16T01:00:00Z',complete:true,coverage:{reportedRows:1,availableRows:1},source:{pageURL:'https://www.tpex.org.tw/web/stock/etf/etfList.aspx',sha256:'a'.repeat(64)},funds:[{symbol:'0050',name:'元大台灣50',issuedUnitsRaw:'1,000',issuedUnits:1000,fundSizeRaw:'2,000,000',fundSize:2000000,closePriceRaw:'100',closePrice:100,navRaw:'99',nav:99,premiumDiscountPercentRaw:'1.01',premiumDiscountPercent:1.01}]});
const flowContext=publicData=>({state:{listing:{stocks:{}}},publicData,card:(title,body)=>`<section><h2>${title}</h2>${body}</section>`,status:(title,message)=>`<aside role="status"><strong>${title}</strong><span>${message}</span></aside>`,metric:(title,value)=>`<div><b>${title}</b><span>${value}</span></div>`,refresh:async()=>{}});

test('M08 monthly source contract keeps source month, raw units, coverage, identity and TPEx lineage strict',()=>{
 const page=createETFUnitFlows(flowContext(async()=>{}));
 assert.equal(page.validMonthlyReport(monthlyFixture(),'2026-09'),true);
 for(const patch of [{complete:false},{unitLabel:'未知'},{source:{...monthlyFixture().source,sha256:'bad'}},{coverage:{reportedRows:2,availableRows:1}},{reportDateROC:'114/09'},{funds:[...monthlyFixture().funds,...monthlyFixture().funds]},{source:{...monthlyFixture().source,pageURL:'https://example.com/report'}}])assert.equal(page.validMonthlyReport({...monthlyFixture(),...patch},'2026-09'),false);
});

test('M08 Web keeps daily/monthly selectors visible when the GitHub Raw artifact is missing',async()=>{
 const page=createETFUnitFlows(flowContext(async()=>{throw new Error('資料讀取失敗（404）');}));
 const html=await page.page();
 assert.match(html,/每日單位變化/);assert.match(html,/月底規模與發行單位/);assert.match(html,/aria-pressed="true"/);assert.match(html,/ETF 每日單位資料暫不可用/);assert.match(html,/404/);
});

test('M08 monthly view renders the selected official month with paired ETF name and symbol',async()=>{
 const report=monthlyFixture();
 const page=createETFUnitFlows(flowContext(async path=>path.endsWith('/index.json')?{schemaVersion:1,periods:['2026-09']} : report));
 const listeners={};page.listen({addEventListener:(name,handler)=>{listeners[name]=handler;}});
 await listeners.click({target:{closest:selector=>selector==='[data-etf-flow-mode]'?{dataset:{etfFlowMode:'monthly'}}:null}});
 const html=await page.page();
 assert.match(html,/月底規模與發行單位/);assert.match(html,/選擇 ETF 月底資料月份/);assert.match(html,/元大台灣50/);assert.match(html,/0050/);assert.match(html,/發行單位（張數）/);assert.match(html,/基金規模（官方元值）/);assert.match(html,/開啟 TPEx 官方月報/);
});


const quarterlyFixture=()=>{
 const entry={period:'2026Q2',route:'mops_etf_2026q2',path:'data/rebuild/etf-quarterly-holdings/2026Q2-mops_etf_2026q2.json',symbols:['0050']};
 const report={schemaVersion:1,period:'2026Q2',reportUniverseCoverage:'UNVERIFIED',scope:'quarterly Taiwan equity disclosure only; not a full multi-asset portfolio',source:'https://mopsov.twse.com.tw/mops/web/t100sb02',sourceSHA256:'a'.repeat(64),parserSHA256:'b'.repeat(64),funds:{'0050':{symbol:'0050',fundName:'元大台灣50',period:'2026Q2',holdingsScope:'TWSE_TPEX_REPORTED_EQUITY_SECURITIES_ONLY',holdings:[{stock_id:'2330',stock_name:'台積電',weight:55.25},{stock_id:'2317',stock_name:'鴻海',weight:10}],reportedTotalWeightPercent:65.25,completeForReportedTaiwanEquityScope:true,completeForFullFundPortfolio:false}}};
 return {entry,report};
};
test('MOPS ETF quarterly contract rejects wrong identity, future period, bad lineage and fake full-portfolio completeness',()=>{
 const {entry,report}=quarterlyFixture();assert.equal(validQuarterlyETFReport(report,entry,'0050','2026-10-18'),true);
 assert.equal(validQuarterlyETFReport({...report,scope:'complete portfolio'},entry,'0050','2026-10-18'),false);
 assert.equal(validQuarterlyETFReport({...report,funds:{...report.funds,'0050':{...report.funds['0050'],completeForFullFundPortfolio:true}}},entry,'0050','2026-10-18'),false);
 assert.equal(validQuarterlyETFReport({...report,sourceSHA256:'bad'},entry,'0050','2026-10-18'),false);
 assert.equal(validQuarterlyETFReport(report,entry,'0050','2026-03-31'),false);
});
test('MOPS ETF quarterly view pairs stock names and codes and states its limited Taiwan-equity scope',async()=>{
 const {entry,report}=quarterlyFixture(),today=taipeiDay();
 const ctx={state:{listing:{cutoff:today,validThrough:today,stocks:{'0050':{status:'LISTED',eligible:true},'2330':{status:'LISTED',eligible:true},'2317':{status:'LISTED',eligible:true}}},rows:[]},publicData:async path=>path==='rebuild/etf-quarterly-holdings/index.json'?{schemaVersion:1,reports:[entry]}:report,card:(title,body)=>`<section><h2>${title}</h2>${body}</section>`,status:(title,message)=>`<aside role="status"><b>${title}</b>${message}</aside>`,metric:(title,value)=>`<div>${title}: ${value}</div>`,rowList:(rows)=>rows.map(row=>`<p>${row.name} ${row.symbol}</p>`).join('')};
 const html=await quarterlyETFDisclosure(ctx,'0050');assert.match(html,/台積電 2330/);assert.match(html,/鴻海 2317/);assert.match(html,/未由此報表證明完整/);assert.match(html,/MOPS 官方季度持股明細/);
});
test('MOPS ETF quarterly view reports a missing canonical index without fetching any alternate source',async()=>{
 const ctx=flowContext(async()=>{throw new Error('資料讀取失敗（404）');});ctx.state.listing={cutoff:taipeiDay(),validThrough:taipeiDay(),stocks:{'0050':{status:'LISTED',eligible:true}}};
 const html=await quarterlyETFDisclosure(ctx,'0050');assert.match(html,/MOPS 官方季報暫不可用/);assert.match(html,/404/);
});
