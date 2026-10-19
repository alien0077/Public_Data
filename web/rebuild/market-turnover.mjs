// The full canonical daily/tw snapshot is the source for the market total.
// Fail closed on stale, sparse, duplicate, or partially populated files.
export function verifiedMarketTurnover(daily, expectedDate) {
 const rows=daily?.stocks;
 if(daily?.date!==expectedDate||!Array.isArray(rows)||rows.length<2000)return {value:null,rowCount:0,date:daily?.date??null};
 const symbols=new Set();let total=0;
 for(const row of rows){
  const symbol=String(row?.id??'').trim(),value=row?.t;
  if(!symbol||symbols.has(symbol)||row.date!==expectedDate||!Number.isFinite(value)||value<0)return {value:null,rowCount:0,date:daily.date};
  symbols.add(symbol);total+=value;
  if(!Number.isFinite(total))return {value:null,rowCount:0,date:daily.date};
 }
 return {value:total,rowCount:rows.length,date:daily.date};
}
