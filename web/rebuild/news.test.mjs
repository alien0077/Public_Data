import test from 'node:test';
import assert from 'node:assert/strict';
import {createNewsPage,classifyAnnouncement} from './news.mjs';
import {escapeHTML} from './core.mjs';

test('M17 news page reports missing canonical feed without requesting third-party feeds',async()=>{
 const originalLocation=globalThis.location,originalFetch=globalThis.fetch;globalThis.location={hash:'#/news?symbol=2330&category=news'};
 let requests=0;globalThis.fetch=async()=>{requests++;throw Error('external news request is forbidden');};
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const ctx={state:{listing:{cutoff:today,validThrough:today,stocks:{'2330':{status:'LISTED',eligible:true,effective_date:today}}}},publicData:async()=>{const error=Error('missing canonical data');error.status=404;throw error;},status:(title,message)=>`STATE:${title}:${message}`,card:(title,body)=>`<section><h2>${escapeHTML(title)}</h2>${body}</section>`};
 try{const html=await createNewsPage(ctx).page('2330',{name:'台積電'});assert.equal(requests,0);assert.match(html,/台積電 2330・新聞與事件/);assert.match(html,/Public_Data 資料缺口/);assert.match(html,/尚未提供個股新聞資料/);assert.match(html,/不會直接向外部新聞網站補資料/);assert.match(html,/Public_Data 尚未提供可驗證的個股新聞資料/);}
 finally{globalThis.fetch=originalFetch;if(originalLocation===undefined)delete globalThis.location;else globalThis.location=originalLocation;}
});

test('M17 news filter reads only the matching Public_Data shard and keeps identity and attribution',async()=>{
 const originalLocation=globalThis.location,originalFetch=globalThis.fetch;globalThis.location={hash:'#/news?symbol=2333&category=news'};
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const event=new Date(`${today}T00:00:00+08:00`);event.setUTCDate(event.getUTCDate()-2);const eventDay=event.toISOString().slice(0,10);
 const paths=[];globalThis.fetch=async()=>{throw Error('no external feed is permitted');};
 const ctx={state:{listing:{cutoff:today,validThrough:today,stocks:{'2333':{status:'LISTED',eligible:true,effective_date:today}}}},publicData:async path=>{paths.push(path);if(path==='rebuild/stock-news/manifest.json')return{schemaVersion:1,feedStatus:'READY',latestPublishedDate:eventDay,shards:{'23':'23.json'}};return{schemaVersion:1,items:[{symbol:'2333',title:'測試公司營運新聞',publisher:'財經媒體',publishedAt:eventDay,url:'https://publisher.example/story'},{symbol:'2454',title:'另一檔新聞',publisher:'媒體',publishedAt:eventDay,url:'https://publisher.example/other'}]};},status:(title,message)=>`STATE:${title}:${message}`,card:(title,body)=>`<section><h2>${escapeHTML(title)}</h2>${body}</section>`};
 try{const html=await createNewsPage(ctx).page('2333',{name:'測試公司'});assert.deepEqual(paths,['rebuild/stock-news/manifest.json','rebuild/stock-news/23.json']);assert.match(html,/測試公司 2333・新聞與事件/);assert.match(html,/測試公司 2333・Public_Data・財經媒體/);assert.match(html,/測試公司營運新聞/);assert.match(html,/<a class=\"directory-link rebuild-news-title\" href=\"https:\/\/publisher\.example\/story\" target=\"_blank\" rel=\"noopener noreferrer\">測試公司營運新聞 ↗<\/a>/);assert.doesNotMatch(html,/<details|<summary>|摘要內容/);assert.match(html,/新聞保留最近 7 日/);assert.doesNotMatch(html,/另一檔新聞/);}
 finally{globalThis.fetch=originalFetch;if(originalLocation===undefined)delete globalThis.location;else globalThis.location=originalLocation;}
});

test('M17 stock news keeps a seven-day window and opens each headline directly',async()=>{
 const originalLocation=globalThis.location;globalThis.location={hash:'#/news?symbol=2335&category=news'};
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const event=new Date(`${today}T00:00:00+08:00`);event.setUTCDate(event.getUTCDate()-8);const oldDay=event.toISOString().slice(0,10);
 const ctx={state:{listing:{cutoff:today,validThrough:today,stocks:{'2335':{status:'LISTED',eligible:true,effective_date:today}}}},publicData:async path=>path==='rebuild/stock-news/manifest.json'?{schemaVersion:1,feedStatus:'READY',latestPublishedDate:oldDay,shards:{'23':'23.json'}}:{schemaVersion:1,items:[{symbol:'2335',title:'八日前新聞',publisher:'財經媒體',publishedAt:oldDay,url:'https://publisher.example/old'}]},status:(title,message)=>`STATE:${title}:${message}`,card:(title,body)=>`<section><h2>${escapeHTML(title)}</h2>${body}</section>`};
 try{const html=await createNewsPage(ctx).page('2335',{name:'測試公司'});assert.match(html,/新聞保留最近 7 日/);assert.match(html,/所選期間沒有可驗證項目/);assert.doesNotMatch(html,/八日前新聞/);}
 finally{if(originalLocation===undefined)delete globalThis.location;else globalThis.location=originalLocation;}
});

test('M17 news feed rejects a manifest shard path outside its symbol prefix',async()=>{
 const originalLocation=globalThis.location;globalThis.location={hash:'#/news?symbol=2334&category=news'};const paths=[];
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const ctx={state:{listing:{cutoff:today,validThrough:today,stocks:{'2334':{status:'LISTED',eligible:true,effective_date:today}}}},publicData:async path=>{paths.push(path);return{schemaVersion:1,feedStatus:'READY',latestPublishedDate:today,shards:{'23':'../bad.json'}};},status:(title,message)=>`STATE:${title}:${message}`,card:(title,body)=>`<section><h2>${escapeHTML(title)}</h2>${body}</section>`};
 try{const html=await createNewsPage(ctx).page('2334',{name:'測試公司'});assert.deepEqual(paths,['rebuild/stock-news/manifest.json']);assert.match(html,/路徑不安全/);}
 finally{if(originalLocation===undefined)delete globalThis.location;else globalThis.location=originalLocation;}
});

test('M17 dividend filter uses only canonical raw events and does not invent an event time',async()=>{
 const originalLocation=globalThis.location,originalFetch=globalThis.fetch;globalThis.location={hash:'#/news?symbol=2331&category=dividends'};
 let publicPath='';globalThis.fetch=async()=>{throw Error('news API should not be requested for dividend filter');};
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const event=new Date(`${today}T00:00:00+08:00`);event.setUTCDate(event.getUTCDate()-5);const eventDay=event.toISOString().slice(0,10);
 const ctx={state:{listing:{cutoff:today,validThrough:today,stocks:{'2331':{status:'LISTED',eligible:true,effective_date:today}}}},publicData:async path=>{publicPath=path;return{data:[{date:eventDay,cash:7,stock:0}]};},status:(title,message)=>`STATE:${title}:${message}`,card:(title,body)=>`<section><h2>${escapeHTML(title)}</h2>${body}</section>`};
 try{const html=await createNewsPage(ctx).page('2331',{name:'測試公司'});assert.equal(publicPath,'dividends/2331.json');assert.match(html,/取得 1 則/);assert.match(html,new RegExp(`${eventDay.slice(0,4)}年${Number(eventDay.slice(5,7))}月${Number(eventDay.slice(8,10))}日`));assert.doesNotMatch(html,/上午8:00|下午4:00/);assert.match(html,/7 元/);}
 finally{globalThis.fetch=originalFetch;if(originalLocation===undefined)delete globalThis.location;else globalThis.location=originalLocation;}
});

test('M17 stale official announcements remain out of the recent list and show the source date',async()=>{
 const originalLocation=globalThis.location;globalThis.location={hash:'#/news?symbol=2332&category=announcements'};
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const ctx={state:{listing:{cutoff:today,validThrough:today,stocks:{'2332':{status:'LISTED',eligible:true,effective_date:today}}}},publicData:async()=>({updates:[{symbol:'2332',date:'2026-09-11',title:'2332 重大訊息',source_url:'https://example.test/mops'}]}),status:(title,message)=>`STATE:${title}:${message}`,card:(title,body)=>`<section><h2>${escapeHTML(title)}</h2>${body}</section>`};
 try{const html=await createNewsPage(ctx).page('2332',{name:'測試公司'});assert.match(html,/最新可用日期為 2026-09-11/);assert.match(html,/所選期間沒有可驗證項目/);assert.doesNotMatch(html,/2026年9月11日/);}
 finally{if(originalLocation===undefined)delete globalThis.location;else globalThis.location=originalLocation;}
});
