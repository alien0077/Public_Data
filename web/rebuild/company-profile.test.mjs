import test from 'node:test';
import assert from 'node:assert/strict';
import {companyBusinessSummary,companyProfileFacts,officialCompanyProfileLinks,sourcedBusinessSummary} from './features.mjs';

test('company profile surfaces only verified HTTPS official source URLs',()=>{
 const links=officialCompanyProfileLinks({homepage:'https://www.tsmc.com',official_profile_url:'https://openapi.twse.com.tw/v1/opendata/t187ap03_L',business_summary_source_url:'https://openapi.twse.com.tw/v1/opendata/t187ap03_L'});
 assert.match(links,/公司官方網站/);assert.match(links,/官方公司基本資料/);assert.match(links,/業務敘述官方來源/);assert.match(links,/rel="noopener noreferrer"/);
 assert.equal(officialCompanyProfileLinks({homepage:'javascript:alert(1)',official_profile_url:'http://example.test'}),'');
});
test('company business summary refuses generated sector placeholders and preserves sourced descriptions',()=>{
 assert.equal(sourcedBusinessSummary('屬於半導體業相關標的 (App 新發現)'),null);
 assert.equal(sourcedBusinessSummary('半導體相關標題'),null);
 assert.equal(sourcedBusinessSummary('提供晶圓代工服務。'),'提供晶圓代工服務。');
 assert.equal(sourcedBusinessSummary('   '),null);
});
test('company page uses only the canonical profile summary with HTTPS provenance and retrieval time',()=>{
 const official={business_summary:'官方記載：主要經營晶圓代工。',business_summary_source_url:'https://mops.twse.com.tw/mops/web/t05st03',business_summary_retrieved_at:'2026-10-18T23:58:15Z'};
 assert.equal(companyBusinessSummary(official),'官方記載：主要經營晶圓代工。');
 assert.equal(companyBusinessSummary({business_summary:'官方記載：主要經營晶圓代工。',business_summary_source_url:'http://example.test',business_summary_retrieved_at:'2026-10-18T23:58:15Z'}),null);
 assert.equal(companyBusinessSummary({business_summary:'官方記載：主要經營晶圓代工。',business_summary_source_url:official.business_summary_source_url}, {business_summary:'未附來源的個股 fallback'}),null);
 assert.equal(companyBusinessSummary({business_summary:'屬於半導體業相關標的',business_summary_source_url:official.business_summary_source_url,business_summary_retrieved_at:official.business_summary_retrieved_at}),null);
});

test('company profile keeps the canonical summary visible when per-security detail is unavailable',()=>{
 const official={business_summary:'官方記載：主要經營晶圓代工。',business_summary_source_url:'https://mops.twse.com.tw/mops/web/t05st03',business_summary_retrieved_at:'2026-10-19T00:35:00Z'};
 assert.equal(companyBusinessSummary(official),'官方記載：主要經營晶圓代工。');
 assert.deepEqual(companyProfileFacts('2330',{name:'台積電',sector:'半導體',market:'TWSE'},null,null),{
  '公司名稱':'台積電','官方產業':'半導體','市場':'TWSE','資料日期':'資料日期不足','基本資料來源日期':'資料日期不足'
 });
 assert.deepEqual(companyProfileFacts('2330',{name:'台積電'}, {stock_id:'2317',date:'2026-10-19'},null),{
  '公司名稱':'台積電','官方產業':'資料不足','市場':'資料不足','資料日期':'資料日期不足','基本資料來源日期':'資料日期不足'
 });
});
