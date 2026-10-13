const allowed=new Set(['rs','rsi','pct','close','ma5','ma10','ma20','ma60','max_return','inst_buy','b_signal']);
export function evaluateSourceDSL(expression,values){
 if(typeof expression!=='string'||!expression.trim())return {matched:null,explanation:'來源未提供策略條件；不推定為不符合'};
 const alternatives=[];
 const branches=expression.split(' OR ');if(branches.some(branch=>!branch.trim()))return {matched:null,explanation:'策略 OR 條件不完整，停止判讀'};
 for(const branch of branches){const all=[];const terms=branch.split(' AND ');if(terms.some(term=>!term.trim()))return {matched:null,explanation:'策略 AND 條件不完整，停止判讀'};for(const term of terms){
  if(/^\s*b_signal\s*\+\s*close\s*<\s*ma10\s*$/.test(term)){if(!Number.isFinite(values.b_signal)||!Number.isFinite(values.close)||!Number.isFinite(values.ma10))return {matched:null,explanation:'資料不足：b_signal；需要與行情同日且包含此證券的法人來源訊號；歷史回測沒有可用的歷史訊號序列'};all.push(values.b_signal>0&&values.close<values.ma10);continue;}
  const instBuy=term.match(/^\s*inst_buy\s*>=\s*(\d+)d\s*$/);if(instBuy){if(!Number.isFinite(values.inst_buy))return {matched:null,explanation:'資料不足：inst_buy；需要最近五個交易日完整外資與投信買賣超資料'};all.push(values.inst_buy>=Number(instBuy[1]));continue;}
  const m=term.match(/^\s*([a-z][a-z0-9_]*)\s*(>=|<=|==|>|<)\s*([a-z][a-z0-9_]*|-?(?:\d+(?:\.\d*)?|\.\d+))\s*$/);
  if(!m)return {matched:null,explanation:`不支援語法：${term}；只接受比較、AND、OR，不將代碼名稱當策略`};
  const [,field,op,rhs]=m;if(!allowed.has(field))return {matched:null,explanation:`缺少因子定義或狀態：${field}；不以零代替`};
  if(!Number.isFinite(values[field]))return {matched:null,explanation:`資料不足：${field}，需要足夠還原行情或來源RSI`};
  let right;if(/^[a-z]/.test(rhs)){if(!allowed.has(rhs))return {matched:null,explanation:`不支援比較因子：${rhs}`};right=values[rhs];}else right=Number(rhs);
  if(!Number.isFinite(right))return {matched:null,explanation:`資料不足：${rhs}`};
  const a=values[field];all.push(op==='>'?a>right:op==='<'?a<right:op==='>='?a>=right:op==='<='?a<=right:a===right);
 }alternatives.push(all.every(Boolean));}
 const matched=alternatives.some(Boolean);return {matched,explanation:matched?'符合來源條件（目前行情觀察）':'不符合來源條件（目前行情觀察）'};
}
export function sourceFactors(bars,rsi){const last=bars.at(-1);if(!last)return {};const values={close:last.adjusted};if(bars.length>=5){const flow=bars.slice(-5);if(flow.every(x=>Number.isFinite(x.foreignNet)&&Number.isFinite(x.trustNet))){let days=0;for(let i=flow.length-1;i>=0&&flow[i].foreignNet+flow[i].trustNet>0;i--)days++;values.inst_buy=days;}}if(Number.isFinite(rsi)&&rsi>=0&&rsi<=100)values.rsi=rsi;if(bars.length>=2)values.pct=(last.adjusted/bars.at(-2).adjusted-1)*100;for(const k of [5,10,20,60])if(bars.length>=k)values[`ma${k}`]=bars.slice(-k).reduce((s,r)=>s+r.adjusted,0)/k;if(bars.length>=251)values.rs=[[63,.5],[126,.3],[250,.2]].reduce((s,[k,w])=>s+(last.adjusted/bars[bars.length-1-k].adjusted-1)*w*100,0);return values;}
