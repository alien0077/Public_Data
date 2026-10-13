// Native TransactionType.cashDividend == 配息; Transaction.shares stores the
// credited amount, not a share count or per-share dividend (PortfolioManager).
export function cashflowRecords(trades,metadata=[]) {
 const records=[],issues=[];
 for(const tx of trades){
  const type=String(tx.type??tx.side??'');
  if(type!=='配息'){if(!['buy','sell','買進','買入','賣出','配股','拆股'].includes(type))issues.push('另有交易類型尚待核對，未計入配息筆數。');continue;}
  const symbol=String(tx.symbol??tx.stock_id??'').trim();
  const raw=tx.shares,amount=typeof raw==='number'&&Number.isFinite(raw)&&raw>=0?raw:null;
  const name=String(tx.name??tx.stockName??'').trim()||metadata.find(x=>x.symbol===symbol)?.name||symbol;
  const rawDate=tx.date??tx.tradeDate;
  const date=typeof rawDate==='string'&&/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(rawDate)&&Number.isFinite(Date.parse(rawDate))&&new Date(rawDate.slice(0,10)+'T00:00:00Z').toISOString().slice(0,10)===rawDate.slice(0,10)?rawDate.slice(0,10):null;
  if(!symbol||amount===null||date===null)issues.push('部分配息紀錄的股票代號、金額或日期待確認；原始紀錄保留。');
  records.push({symbol,name:name||'股票身份待確認',amount,date,notes:typeof tx.notes==='string'?tx.notes:''});
 }
 return {records:records.sort((a,b)=>(b.date??'').localeCompare(a.date??'')),issues:[...new Set(issues)]};
}
