import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {quarterlyFundHoldingsPanel} from './etf.mjs';
import {taipeiDay} from './core.mjs';

const reportPath='data/rebuild/etf-quarterly-holdings/2026Q1-t78sb35_new.json';
const rawArchivePath='data/rebuild/etf-quarterly-holdings/raw/2026Q1/';

function fixture(){
 const raw=Buffer.from('<html>official MOPS Q1 report</html>');
 const sha=createHash('sha256').update(raw).digest('hex');
 const fund={symbol:'0050',fundName:'元大台灣卓越50證券投資信託基金',period:'2026Q1',holdingsScope:'TWSE_TPEX_REPORTED_EQUITY_SECURITIES_ONLY',holdings:[{stock_id:'2330',stock_name:'台積電',weight:63.17}],reportedTotalWeightPercent:63.17,completeForReportedTaiwanEquityScope:true,completeForFullFundPortfolio:false};
 const report={schemaVersion:1,period:'2026Q1',reportUniverseCoverage:'UNVERIFIED',scope:'quarterly Taiwan equity disclosure only; not a full multi-asset portfolio',source:'https://mopsov.twse.com.tw/mops/web/t78sb35_new',sourceSHA256:sha,parserSHA256:'b'.repeat(64),rawArchive:`${rawArchivePath}${sha}.html`,funds:{'0050':fund}};
 const index={schemaVersion:1,reports:[{period:'2026Q1',route:'t78sb35_new',path:reportPath,symbols:['0050']}]};
 const requests=[],byteRequests=[];
 const ctx={state:{listing:{cutoff:taipeiDay(),validThrough:taipeiDay(),stocks:{'0050':{status:'LISTED',eligible:true},'2330':{status:'LISTED',eligible:true,name:'台積電'}}},rows:[]},publicData:async path=>{requests.push(path);if(path==='rebuild/etf-quarterly-holdings/index.json')return index;if(path===reportPath.slice(5))return report;throw Error('unexpected source path');},publicBytes:async path=>{byteRequests.push(path);if(path===report.rawArchive.slice(5))return raw;throw Error('unexpected raw source path');},status:(title,message)=>`STATE:${title}:${message}`,card:(title,body)=>`CARD:${title}:${body}`,rowList:(rows)=>`ROWS:${rows.map(row=>`${row.name} ${row.symbol} ${row.weight}`).join('|')}`};
 return {ctx,report,requests,byteRequests,raw};
}

test('loads the official quarter and preserves the Taiwan-equity-only scope',async()=>{
 const {ctx,requests,byteRequests,report}=fixture();
 const result=await quarterlyFundHoldingsPanel(ctx,'0050',{name:'元大台灣50'});
 assert.match(result,/MOPS 官方季度持股明細/);
 assert.match(result,/海外資產、債券、現金、衍生品/);
 assert.match(result,/台積電 2330 63\.17/);
 assert.deepEqual(requests,['rebuild/etf-quarterly-holdings/index.json','rebuild/etf-quarterly-holdings/2026Q1-t78sb35_new.json']);
 assert.deepEqual(byteRequests,[report.rawArchive.slice(5)]);
});

test('fails closed when the archived source bytes do not match the report hash',async()=>{
 const {ctx}=fixture();
 ctx.publicBytes=async()=>Buffer.from('<html>changed after import</html>');
 const result=await quarterlyFundHoldingsPanel(ctx,'0050',{name:'元大台灣50'});
 assert.match(result,/官方 ETF 季報來源驗證失敗/);
 assert.match(result,/MOPS 原始 HTML SHA-256 不符/);
 assert.doesNotMatch(result,/ROWS:/);
});

test('refuses a report that claims full-fund completeness',async()=>{
 const {ctx,report}=fixture();
 report.funds['0050'].completeForFullFundPortfolio=true;
 const result=await quarterlyFundHoldingsPanel(ctx,'0050',{name:'元大台灣50'});
 assert.match(result,/官方 ETF 季報暫不可用/);
 assert.doesNotMatch(result,/ROWS:/);
});

test('does not infer missing official reports as an empty portfolio',async()=>{
 const {ctx}=fixture();
 ctx.publicData=async()=>({schemaVersion:1,reports:[]});
 const result=await quarterlyFundHoldingsPanel(ctx,'0050',{name:'元大台灣50'});
 assert.match(result,/尚無此 ETF 的官方季報/);
 assert.match(result,/不表示基金沒有持股/);
});
