import test from 'node:test';
import assert from 'node:assert/strict';
import {indexIntraday,indexIntradayBySymbol} from './index-intraday.mjs';

const taipeiDate = timestamp => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(new Date(timestamp * 1000));

test('index intraday lines use Taiwan red-up green-down from canonical close-to-close change', async () => {
  const now = Date.now();
  const generatedAt = new Date(now).toISOString();
  const first = Math.floor((now - 60_000) / 1000);
  const last = Math.floor((now - 30_000) / 1000);
  const row = (symbol, name, opening, closing) => ({
    symbol, name, status: 'AVAILABLE', dataDate: taipeiDate(last),
    points: [{timestamp: first, close: opening}, {timestamp: last, close: closing}]
  });
  const data = {
    schemaVersion: 1, source: 'yahoo.chart.1m', generatedAt,
    indices: [row('IX0001', '加權指數', 100, 101), row('IX0043', '櫃買指數', 200, 199)]
  };
  const html = await indexIntraday({
    state:{indices:[{symbol:'IX0001',changePercent:1},{symbol:'IX0043',changePercent:-1}]},
    publicData: async path => { assert.equal(path, 'rebuild/index-intraday.json'); return data; },
    card: (title, body) => `<article><h2>${title}</h2>${body}</article>`
  });
  assert.match(html, /stroke="var\(--up\)"/);
  assert.match(html, /stroke="var\(--down\)"/);
  assert.match(html, /fill="var\(--up\)" fill-opacity="\.32"/);
  assert.match(html, /fill="var\(--down\)" fill-opacity="\.32"/);
});

test('mobile overview receives one compact intraday chart per matching index identity', async () => {
  const now = Date.now();
  const generatedAt = new Date(now).toISOString();
  const first = Math.floor((now - 60_000) / 1000);
  const last = Math.floor((now - 30_000) / 1000);
  const data = {
    schemaVersion: 1, source: 'yahoo.chart.1m', generatedAt,
    indices: [
      {symbol:'IX0001',name:'加權指數',status:'AVAILABLE',dataDate:taipeiDate(last),points:[{timestamp:first,close:100},{timestamp:last,close:101}]},
      {symbol:'IX0043',name:'櫃買指數',status:'AVAILABLE',dataDate:taipeiDate(last),points:[{timestamp:first,close:200},{timestamp:last,close:199}]}
    ]
  };
  const result = await indexIntradayBySymbol({
    publicData: async path => { assert.equal(path, 'rebuild/index-intraday.json'); return data; },
    state: {indices:[{symbol:'IX0001',changePercent:1},{symbol:'IX0043',changePercent:-1}]}
  });
  assert.match(result.IX0001, /stroke="var\(--up\)"/);
  assert.match(result.IX0043, /stroke="var\(--down\)"/);
  assert.match(result.IX0001, /aria-label="更新加權指數分時快照"/);
  assert.doesNotMatch(result.IX0001, /<details[^>]*>分時數值|<summary>分時數值/);
  assert.match(result.IX0001, /縱軸指數，橫軸台北時間/);
  assert.equal((result.IX0001.match(/class="grid"/g)||[]).length,3);
  assert.match(result.IX0001, /text-anchor="middle">/);
  assert.doesNotMatch(result.IX0001, /2026-10-14T/);
});

test('index intraday SVG includes labeled time and value axes', async () => {
  const now=Date.now(), first=Math.floor((now-60_000)/1000), last=Math.floor((now-30_000)/1000);
  const data={schemaVersion:1,source:'yahoo.chart.1m',generatedAt:new Date(now).toISOString(),indices:[
    {symbol:'IX0001',name:'加權指數',status:'AVAILABLE',dataDate:taipeiDate(last),points:[{timestamp:first,close:100},{timestamp:last,close:101}]},
    {symbol:'IX0043',name:'櫃買指數',status:'UNAVAILABLE',dataDate:taipeiDate(last),points:[]}
  ]};
  const result=await indexIntradayBySymbol({publicData:async()=>data,state:{indices:[{symbol:'IX0001',changePercent:1}]}});
  assert.match(result.IX0001,/縱軸指數，橫軸台北時間/);
  assert.match(result.IX0001,/class="grid"/);
  assert.match(result.IX0001,/<polygon points="[^"]+" fill="var\(--up\)" fill-opacity="\.32"/);
  assert.match(result.IX0001,/text-anchor="end">/);
  assert.match(result.IX0001,/x="106" y="[^"]+" text-anchor="end">/);
  assert.match(result.IX0001,/x1="110" x2="614"/);
});

test('missing intraday snapshot falls back to labeled raw daily index history', async () => {
  const dates=['2026-10-14','2026-10-15'];
  const result=await indexIntradayBySymbol({
    publicData:async path=>{
      if(path==='rebuild/index-intraday.json')throw Error('HTTP 404');
      const date=path.match(/(\d{4}-\d{2}-\d{2})\.json$/)?.[1];
      assert.ok(dates.includes(date),`unexpected daily request ${path}`);
      return {date,stocks:[{id:'IX0001',c:date===dates[0]?100:110},{id:'IX0043',c:date===dates[0]?200:190}]};
    },
    // The latest daily move intentionally disagrees with the selected chart
    // interval. The area color must match the plotted interval, like iOS.
    state:{index:{available_days_tw_indices:dates},indices:[{symbol:'IX0001',changePercent:-2},{symbol:'IX0043',changePercent:1}]}
  });
  assert.match(result.IX0001,/<p class="index-history-meta">原始日線・非盤中・2026-10-14–2026-10-15・2 交易日<\/p>/);
  assert.match(result.IX0001,/縱軸原始指數收盤，橫軸交易日/);
  assert.match(result.IX0001,/viewBox="0 0 640 156"/);
  assert.match(result.IX0001,/fill="var\(--up\)" fill-opacity="\.32"/);
  assert.match(result.IX0043,/fill="var\(--down\)" fill-opacity="\.32"/);
  assert.match(result.IX0001,/10-14/);
  assert.match(result.IX0001,/10-15/);
  assert.match(result.IX0001,/class="index-history-meta"/);
  assert.doesNotMatch(result.IX0001,/分時數值/);
});

test('missing snapshot does not apply Taiwan index 404 to US indices or TSM ADR', async () => {
  const usSymbols=['^DJI','^IXIC','^GSPC','^SOX','TSM'];
  const symbols=['IX0001','IX0043',...usSymbols];
  const result=await indexIntradayBySymbol({
    publicData:async path=>{throw Error(`HTTP 404 ${path}`);},
    state:{index:{available_days_tw_indices:['2026-10-16']},indices:symbols.map(symbol=>({symbol}))}
  });
  assert.match(result.IX0001,/台股指數日線歷史亦不可用：HTTP 404/);
  for(const symbol of usSymbols){
    assert.match(result[symbol],/Public_Data 未提供此美股／ADR 分時序列/);
    assert.match(result[symbol],/最近可用的 Public_Data 日線收盤/);
    assert.doesNotMatch(result[symbol],/日線歷史亦不可用|HTTP 404/);
  }
});
