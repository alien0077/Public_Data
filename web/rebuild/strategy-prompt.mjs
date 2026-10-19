// Offline-safe subset of the native LLMStrategyParser.parse(prompt:) fallback.
const factor=(type,op,value=null,targetFactor=null)=>({factor:{type,op,value,targetFactor,offset:0,period:0,params:null}});
const combine=conditions=>conditions.length===1?conditions[0]:{and:conditions};
export function parseLocalStrategyPrompt(prompt){
 const text=String(prompt||'').trim(),lower=text.toLowerCase();if(!text||text.length>2000)return null;
 const conditions=[];
 if(lower.includes('rs')){
  const op=lower.includes('小於')?'<':'>';
  const match=lower.match(/於\s*([+-]?(?:\d+\.?\d*|\.\d+))/);
  if(match)conditions.push(factor('trend',op,Number(match[1])/100));
 }
 if(lower.includes('動能強')||lower.includes('強勢'))conditions.push(factor('mom20','>',0.75));
 if(lower.includes('vcp'))conditions.push({pattern:{type:'波動收縮(VCP)',minConfidence:0.7}});
 if(lower.includes('突破年線')||lower.includes('站上年線'))conditions.push(factor('trend','>',0.8));
 if(lower.includes('突破月線'))conditions.push(factor('mom20','>',0.6));
 const usesMA20=lower.includes('20日均線')||lower.includes('ma20');
 if(usesMA20)conditions.push(factor('close_price','>',null,'ma20'));
 if(!conditions.length)return null;
 const sellCondition=usesMA20?factor('close_price','<',null,'ma20'):factor('mom20','<',0.3);
 return {name:`本機策略：${Array.from(text).slice(0,15).join('')}…`,buyCondition:combine(conditions),sellCondition,prompt:text,isFavorite:false};
}
