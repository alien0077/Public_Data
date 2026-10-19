export const emptyScanner = () => ({query:'',market:'',minPrice:'',maxPrice:'',minVolume:''});
export function validateScanner(input={}) {
 const filter={query:String(input.query??'').trim().toLocaleLowerCase(),market:String(input.market??'').trim()};
 if(!['','TWSE','TPEX'].includes(filter.market))return {error:'請選擇有效市場。'};
 for(const [key,label] of [['minPrice','最低原始市價'],['maxPrice','最高原始市價'],['minVolume','最低成交量']]) {
  const text=String(input[key]??'').trim();
  const value=text===''?null:Number(text);
  if(value!==null&&(!/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text)||!Number.isFinite(value)||value<0))return {error:`${label}須為有限的非負數；空白表示不限制。`};
  filter[key]=value;
 }
 if(filter.minPrice!==null&&filter.maxPrice!==null&&filter.minPrice>filter.maxPrice)return {error:'最低原始市價不可高於最高原始市價。'};
 return {filter};
}
// Input rows must already pass the application's listing eligibility gate.
export function filterScannerRows(rows,filter) {
 return rows.filter(r=>(!filter.query||`${r.name??''} ${r.symbol??''} ${r.sector??''}`.toLocaleLowerCase().includes(filter.query))
  &&(!filter.market||String(r.market??'').toUpperCase()===filter.market)
  &&(filter.minPrice===null||(Number.isFinite(r.price)&&r.price>=filter.minPrice))
  &&(filter.maxPrice===null||(Number.isFinite(r.price)&&r.price<=filter.maxPrice))
  &&(filter.minVolume===null||(Number.isFinite(r.volume)&&r.volume>=filter.minVolume)));
}

export function readScannerPreference(storage) {
 try {const raw=JSON.parse(storage.getItem('rebuild.scanner.v1'));if(raw&&typeof raw==='object'&&!Array.isArray(raw)&&!validateScanner(raw).error)return {...emptyScanner(),...raw};}catch{}
 return emptyScanner();
}
