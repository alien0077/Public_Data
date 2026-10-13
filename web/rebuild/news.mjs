import {escapeHTML as e,resolveListingStatus,taipeiDay} from './core.mjs';

const noise=['台股風向球','鄭麗文','習近平','馬英九','蔡英文','賴清德'];
const safeURL=value=>{try{const url=new URL(value);return ['https:','http:'].includes(url.protocol)?url.href:null;}catch{return null;}};
async function request(url){
 const response=await fetch(url,{credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw Error(`來源回應 ${response.status}`);
 return response;
}
export function readNewsRSS(text,symbol){
 const xml=new DOMParser().parseFromString(text,'application/xml');
 if(xml.querySelector('parsererror'))throw Error('RSS 格式無法解析');
 return [...xml.querySelectorAll('item')].flatMap(item=>{
  const field=key=>item.querySelector(key)?.textContent?.trim()||'',url=safeURL(field('link')),title=field('title'),stamp=Date.parse(field('pubDate'));
  if(!title||!url)return [];
  return [{symbol,title,url,source:field('source')||'Google News',publishedAt:Number.isFinite(stamp)?new Date(stamp).toISOString():null}];
 });
}
export function createNewsPage(ctx){
 async function page(symbol,row){
  const allowed=()=>resolveListingStatus(symbol,taipeiDay(),ctx.state.listing).eligible;
  if(!allowed())return ctx.status('上市資格尚未確認','請先同步目前上市資料。');
  const name=row.name||symbol,query=`"${symbol}" "${name}"`;
  const rss=async site=>{const q=query+(site?` site:${site}`:'');const response=await request(`https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=zh-TW&gl=TW&ceid=TW:zh-Hant`);return readNewsRSS(await response.text(),symbol);};
  const anue=async()=>{
   const response=await request(`https://api.cnyes.com/media/api/v1/newslist/category/tw_stock?limit=15&stockId=${encodeURIComponent(symbol)}`),data=await response.json();
   if(!Array.isArray(data.items?.data))throw Error('新聞資料格式不符');
   return data.items.data.flatMap(item=>{
    if(typeof item.title!=='string'||!Number.isSafeInteger(item.newsId)||item.newsId<1)return [];
    const timestamp=typeof item.publishAt==='number'?item.publishAt*1000:NaN;
    return [{symbol,title:item.title,source:'鉅亨網',url:`https://news.cnyes.com/news/id/${item.newsId}`,publishedAt:Number.isFinite(timestamp)&&Math.abs(timestamp)<=8640000000000000?new Date(timestamp).toISOString():null,summary:typeof item.summary==='string'?item.summary:null}];
   });
  };
  const sources=['鉅亨網','CMoney／Google RSS','Google News RSS'],results=await Promise.allSettled([anue(),rss('cmoney.tw'),rss()]);
  if(!allowed())return ctx.status('上市資格已過期','請同步資料後重新載入新聞。');
  const seen=new Set(),items=results.flatMap(r=>r.status==='fulfilled'?r.value:[]).filter(item=>{
   if(!(item.title.includes(symbol)||(name!==symbol&&item.title.includes(name)))||noise.some(word=>item.title.includes(word))||seen.has(item.url))return false;
   seen.add(item.url);return true;
  }).sort((a,b)=>(b.publishedAt||'').localeCompare(a.publishedAt||''));
  const date=value=>value?new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',dateStyle:'medium',timeStyle:'short'}).format(new Date(value)):'發布日期不足';
  const failures=results.flatMap((result,i)=>result.status==='rejected'?[sources[i]]:[]);
  let html=ctx.card(`${name} ${symbol}・新聞`,`<p>依標題中的名稱或代號篩選，按來源發布時間排列。</p><p role="status">取得 ${items.length} 則；${results.length-failures.length}／${results.length} 個來源成功。</p><button data-action="reload">重新載入新聞</button>`);
  if(failures.length)html+=ctx.card('部分新聞來源無法載入',`<p>${failures.map(e).join('、')}</p><p>可能為網路、瀏覽器跨來源限制或來源暫時不可用；目前結果不代表完整新聞。可稍後重新載入。</p>`);
  if(!items.length)html+=ctx.status(failures.length===sources.length?'新聞來源暫不可用':'尚無符合的新聞','公司事件摘要不會冒充新聞串流。');
  html+=items.map(item=>ctx.card(item.title,`<p class="source">${e(name)} ${e(symbol)}・${e(item.source)}・${e(date(item.publishedAt))}</p>${item.summary?`<p>${e(item.summary)}</p>`:''}<a class="directory-link" href="${e(item.url)}" target="_blank" rel="noopener noreferrer">閱讀原文 ↗</a>`)).join('');
  return html;
 }
 return {page};
}
