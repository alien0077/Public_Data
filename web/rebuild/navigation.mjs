import {taipeiDay} from './core.mjs';

const primaryTabs=new Set(['market','watchlist','explore','assets','more']);
const eligibilityIndependentRoutes=new Set([
 'briefing','fx','services','more','appearance',
 'transactions','trade','edit-trade','import','import-preview','import-result',
 'backup','restore','upgrade'
]);
const historicalDetailRoutes=new Set(['company','revenue','earnings','dividends']);
const routeOverrides={
 'dark-watchlist':'watchlist',
 'dark-security':'explore',
 'dark-etf':'explore',
 'empty':'watchlist',
 'error':'market',
 'startup-error':'market',
 'offline':'assets'
};
const previewSymbols={
 'dark-security':'2330',
 'dark-etf':'0050'
};

export function primaryTabForRoute(id,contractTab){
 return routeOverrides[id]??(primaryTabs.has(contractTab)?contractTab:'market');
}

export function previewSymbolForRoute(id,symbol){
 return symbol||previewSymbols[id]||null;
}

export function navigationForRouteContent({body,securityRoute,securityNavigation,conceptNavigation}){
 if(securityRoute)return body.startsWith('<nav class="detail-sections"')?body:`${securityNavigation}${body}`;
 return `${conceptNavigation}${body}`;
}

export function securityNavigationForRoute(active,{isETF=false,healthView=false}={}){
 const ids=isETF?['etf','candles','intraday','constituents','rebalance','etf-performance','fund','bond','records']:['security','candles','intraday','company','revenue','earnings','dividends','fair-value','valuation-evidence','flows','shareholders','margin','news','health','records'];
 const healthTabs=[['health','總覽'],['candles','技術分析'],['flows','籌碼面'],['company','基本面'],['earnings','財務觀察']];
 const companyFinancialTabs=[['company','基本資料'],['revenue','月營收'],['earnings','獲利與財務'],['flows','籌碼']];
 const groups={intraday:'intraday',candles:'intraday',company:'company',revenue:'revenue',earnings:'earnings',dividends:'earnings','fair-value':'earnings','valuation-evidence':'earnings',shareholders:'flows',margin:'flows',rebalance:'constituents',fund:'etf-performance',bond:'etf-performance'};
 const useCompanyFinancialTabs=!isETF&&['company','revenue','earnings'].includes(active);
 const tabs=isETF?[['etf','總覽'],['candles','圖表'],['constituents','成分'],['etf-performance','配息']]:useCompanyFinancialTabs?companyFinancialTabs:healthView?healthTabs:[['security','總覽'],['intraday','圖表'],['earnings','財務'],['flows','籌碼']];
 const current=useCompanyFinancialTabs?active:healthView?({health:'health',security:'health',candles:'candles',flows:'flows',company:'company',earnings:'earnings'}[active]??active):groups[active]??active;
 return {ids,tabs,current};
}

export function listingWarningAppliesToRoute(id){
 return !eligibilityIndependentRoutes.has(id);
}

const quoteWarningRoutes=new Set([
 'overview','heatmap','rankings','watchlist','search','scanner','quick-filter','quant','hot','sector-pe',
 'rotation','rotation-history','security','etf','intraday','candles','fair-value','valuation-evidence',
 'flows','shareholders','margin','health','assets','holdings','allocation','risk','cashflow','performance','annual','simulation'
]);
export function marketQuoteWarningAppliesToRoute(id){return quoteWarningRoutes.has(id);}

export function detailRouteRequiresListingEligibility(id){
 return !historicalDetailRoutes.has(id);
}

export async function loadListingSnapshot(load){
 try{return await load();}
 catch(error){
  if(error?.status!==404)throw error;
  return {schemaVersion:1,cutoff:'',validThrough:'',stocks:{},sourceMissing:true};
 }
}

export async function loadCanonicalListingSnapshot(publicData){
 const today=taipeiDay(),metadata=await publicData('meta/stocks.json');
 const rows=Array.isArray(metadata?.stocks)?metadata.stocks:[];
 const stocks=Object.fromEntries(rows.filter(row=>typeof row?.symbol==='string'&&row.symbol.trim()&&typeof row?.name==='string'&&row.name.trim()).map(row=>{
  return [row.symbol,{symbol:row.symbol,name:row.name,status:'LISTED',eligible:true,reason:'CURRENT_PUBLIC_DATA_STOCK_UNIVERSE',securityType:row.official_sector==='ETF'?'fund':'equity',market:row.market??''}];
 }));
 if(!Object.keys(stocks).length)throw new Error('Public_Data meta/stocks.json 目前股票清單無有效資料');
 return {schemaVersion:1,cutoff:today,validThrough:today,source:'meta/stocks.json current universe',stocks};
}
