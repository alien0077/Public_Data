import assert from 'node:assert/strict';
import test from 'node:test';
import {detailRouteRequiresListingEligibility,listingWarningAppliesToRoute,loadCanonicalListingSnapshot,loadListingSnapshot,marketQuoteWarningAppliesToRoute,navigationForRouteContent,primaryTabForRoute,previewSymbolForRoute,securityNavigationForRoute} from './navigation.mjs';

test('M14 feature pages retain the shared security tabs without duplicating tabs already in content',()=>{
 const securityNavigation='<nav class="detail-sections" aria-label="個股詳情分區">M13・M14 tabs</nav>';
 assert.equal(navigationForRouteContent({body:'<section class="card">M14 revenue</section>',securityRoute:true,securityNavigation,conceptNavigation:'<nav class="concept-tabs">wrong</nav>'}),`${securityNavigation}<section class="card">M14 revenue</section>`);
 assert.equal(navigationForRouteContent({body:`${securityNavigation}<section class="card">M13 detail</section>`,securityRoute:true,securityNavigation,conceptNavigation:''}),`${securityNavigation}<section class="card">M13 detail</section>`);
});

test('non-security M01/M03-M22 routes retain their planned concept navigation',()=>{
 const conceptNavigation='<nav class="concept-tabs">M07 tabs</nav>';
 assert.equal(navigationForRouteContent({body:'<section class="card">M07 report</section>',securityRoute:false,securityNavigation:'',conceptNavigation}),`${conceptNavigation}<section class="card">M07 report</section>`);
});

test('M14 historical company financial evidence does not require a current quote-eligibility snapshot',()=>{
 for(const route of ['company','revenue','earnings','dividends'])assert.equal(detailRouteRequiresListingEligibility(route),false,route);
 for(const route of ['security','etf','intraday','candles','fair-value','flows','health'])assert.equal(detailRouteRequiresListingEligibility(route),true,route);
});

test('M14 mobile detail tabs use the planned basic data, revenue and earnings labels and select the exact route',()=>{
 for(const [route,label] of [['company','基本資料'],['revenue','月營收'],['earnings','獲利與財務']]){
  const nav=securityNavigationForRoute(route);
  assert.deepEqual(nav.tabs.map(([id,title])=>[id,title]),[['company','基本資料'],['revenue','月營收'],['earnings','獲利與財務'],['flows','籌碼']]);
  assert.equal(nav.tabs.find(([id])=>id===nav.current)?.[1],label);
 }
});

test('M24 dark preview routes select the matching primary tab',()=>{
 assert.equal(primaryTabForRoute('dark-watchlist','state'),'watchlist');
 assert.equal(primaryTabForRoute('dark-security','state'),'explore');
 assert.equal(primaryTabForRoute('dark-etf','state'),'explore');
});

test('M23 empty, error, and offline states stay inside their planned primary tab',()=>{
 assert.equal(primaryTabForRoute('empty','state'),'watchlist');
 assert.equal(primaryTabForRoute('error','state'),'market');
 assert.equal(primaryTabForRoute('offline','state'),'assets');
});

test('primary tab selection preserves canonical tabs and defaults unsupported routes to market',()=>{
 for(const tab of ['market','watchlist','explore','assets','more'])assert.equal(primaryTabForRoute('ordinary-route',tab),tab);
 assert.equal(primaryTabForRoute('ordinary-route','state'),'market');
});

test('M24 dark security previews use their planned symbols without overriding an explicit symbol',()=>{
 assert.equal(previewSymbolForRoute('dark-security',null),'2330');
 assert.equal(previewSymbolForRoute('dark-etf',null),'0050');
 assert.equal(previewSymbolForRoute('dark-security','2454'),'2454');
 assert.equal(previewSymbolForRoute('ordinary-route',null),null);
});

test('listing-expiry warning is scoped away from eligibility-independent utility routes',()=>{
 for(const route of ['briefing','fx','services','more','appearance','transactions','trade','import','import-preview','import-result','backup','restore','upgrade'])assert.equal(listingWarningAppliesToRoute(route),false);
 for(const route of ['overview','watchlist','scanner','security','sync'])assert.equal(listingWarningAppliesToRoute(route),true);
});

test('market quote/reference warnings stay on quote-dependent pages, not local transfer or settings routes',()=>{
 for(const route of ['import','import-preview','import-result','backup','restore','upgrade','transactions','new-trade','trade','briefing','fx','services','appearance','tools','about','sync'])assert.equal(marketQuoteWarningAppliesToRoute(route),false,route);
 for(const route of ['overview','heatmap','rankings','watchlist','security','etf','intraday','candles','assets','holdings','allocation'])assert.equal(marketQuoteWarningAppliesToRoute(route),true,route);
});

test('missing canonical listing snapshot remains usable as an explicit fail-closed empty snapshot',async()=>{
 const snapshot=await loadListingSnapshot(async()=>{const error=new Error('資料讀取失敗（404）');error.status=404;throw error;});
 assert.deepEqual(snapshot,{schemaVersion:1,cutoff:'',validThrough:'',stocks:{},sourceMissing:true});
});

test('current stocks.json alone defines the current universe without requesting an eligibility sidecar',async()=>{
 const requested=[];
 const snapshot=await loadCanonicalListingSnapshot(async path=>{requested.push(path);return {stocks:[{symbol:'2330',name:'台積電',market:'TWSE',official_sector:'半導體'},{symbol:'0050',name:'元大台灣50',market:'TWSE',official_sector:'ETF'}]};});
 assert.deepEqual(requested,['meta/stocks.json']);
 assert.equal(snapshot.source,'meta/stocks.json current universe');
 assert.equal(snapshot.stocks['2330'].eligible,true);
 assert.equal(snapshot.stocks['2330'].status,'LISTED');
 assert.equal(snapshot.stocks['0050'].securityType,'fund');
 assert.equal(snapshot.stocks.DEAD,undefined);
 assert.equal(snapshot.cutoff,snapshot.validThrough);
});

test('missing or empty stocks.json fails visibly instead of using a secondary universe',async()=>{
 await assert.rejects(loadCanonicalListingSnapshot(async()=>{throw new Error('meta/stocks.json unavailable');}),/meta\/stocks\.json unavailable/);
 await assert.rejects(loadCanonicalListingSnapshot(async()=>({stocks:[]})),/meta\/stocks\.json/);
});

test('listing snapshot loader does not mask network or server failures',async()=>{
 for(const status of [undefined,403,500]){
  const failure=new Error('資料讀取失敗');if(status!==undefined)failure.status=status;
  await assert.rejects(loadListingSnapshot(async()=>{throw failure;}),failure);
 }
});
