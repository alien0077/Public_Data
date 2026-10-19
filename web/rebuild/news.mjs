import {escapeHTML as e,resolveListingStatus,taipeiDay} from './core.mjs';

const safeURL=value=>{try{const url=new URL(value);return ['https:','http:'].includes(url.protocol)?url.href:null;}catch{return null;}};
const categories=[['all','全部'],['news','新聞'],['announcements','重大公告'],['investor','法說會'],['dividends','除權息'],['other','其它']];
const requestCache=new Map();
function cached(key,loader){
 const prior=requestCache.get(key);if(prior&&prior.expires>Date.now())return prior.promise;
 const promise=loader().catch(error=>{requestCache.delete(key);throw error;});
 requestCache.set(key,{expires:Date.now()+300000,promise});return promise;
}
export function classifyAnnouncement(title){
 if(/法人說明會|法說會|受邀參加.*法人|法人.*說明會/.test(title))return 'investor';
 if(/重大訊息|重大公告/.test(title))return 'announcements';
 return 'other';
}
export function createNewsPage(ctx){
 async function page(symbol,row){
  const allowed=()=>resolveListingStatus(symbol,taipeiDay(),ctx.state.listing).eligible;
  if(!allowed())return ctx.status('上市資格尚未確認','請先同步目前上市資料。');
  const name=row.name||symbol,query=`"${symbol}" "${name}"`,params=new URLSearchParams(globalThis.location?.hash?.split('?')[1]??''),selected=categories.some(([id])=>id===params.get('category'))?params.get('category'):'all';
  const tabs=categories.map(([id,label])=>`<a class="chip ${id===selected?'selected':''}" href="#/news?symbol=${encodeURIComponent(symbol)}&category=${id}" ${id===selected?'aria-current="page"':''}>${label}</a>`).join('');
  const toolbar=`<nav class="toolbar news-category-tabs" aria-label="新聞與事件分類">${tabs}</nav>`;
  const newsGap='Public_Data 尚未提供個股新聞資料';
  const loadNews=async()=>{
   let manifest;try{manifest=await ctx.publicData('rebuild/stock-news/manifest.json');}catch(error){if(error?.status===404)return {items:[],failures:[],gaps:[newsGap],sourceDate:null};throw error;}
   if(manifest?.schemaVersion!==1||!manifest.shards||typeof manifest.shards!=='object')throw Error('Public_Data 個股新聞 manifest 契約不符');
   if(manifest.feedStatus!=='READY')return {items:[],failures:[],gaps:['Public_Data 個股新聞近期資料尚未同步'],sourceDate:manifest.latestPublishedDate??null};
   const filename=manifest.shards[symbol.slice(0,2)];
   if(!filename)return {items:[],failures:[],gaps:[newsGap],sourceDate:manifest.latestPublishedDate??null};
   if(filename!==`${symbol.slice(0,2)}.json`)throw Error('Public_Data 個股新聞分片路徑不安全');
   let shard;try{shard=await ctx.publicData(`rebuild/stock-news/${encodeURIComponent(filename)}`);}catch(error){if(error?.status===404)return {items:[],failures:[],gaps:[`Public_Data 個股新聞分片缺失：${filename}`],sourceDate:manifest.latestPublishedDate??null};throw error;}
   if(shard?.schemaVersion!==1||!Array.isArray(shard.items))throw Error('Public_Data 個股新聞分片契約不符');
   const items=shard.items.filter(item=>item.symbol===symbol&&typeof item.title==='string'&&typeof item.publishedAt==='string').map(item=>({symbol,title:item.title.trim(),source:`Public_Data・${item.publisher||'來源未標示'}`,url:safeURL(item.url),publishedAt:/^\d{4}-\d{2}-\d{2}$/.test(item.publishedAt)?`${item.publishedAt}T00:00:00Z`:null,category:'news'})).filter(item=>item.title&&item.url&&item.publishedAt);
   return {items,failures:[],gaps:[],sourceDate:manifest.latestPublishedDate??null};
  };
  const loadAnnouncements=async()=>{
   const data=await ctx.publicData('announcements/parsed/latest.json'),rows=Array.isArray(data.updates)?data.updates:[],latest=rows.map(x=>x.date).filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(x??'')).sort().at(-1)??null;
   const matched=rows.filter(x=>x.symbol===symbol&&typeof x.title==='string').map(x=>({symbol,title:x.title.trim(),source:'Public_Data・公司公告',url:safeURL(x.source_url),publishedAt:/^\d{4}-\d{2}-\d{2}$/.test(x.date??'')?`${x.date}T00:00:00Z`:null,category:classifyAnnouncement(x.title)})).filter(x=>x.url);
   return {items:matched,sourceDate:latest};
  };
  const loadDividends=async()=>{
   const data=await ctx.publicData(`dividends/${encodeURIComponent(symbol)}.json`),rows=Array.isArray(data.data)?data.data:[],sourceDate=rows.map(x=>x.date).filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(x??'')).sort().at(-1)??null;
   return {items:rows.filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(x.date??'')&&Number.isFinite(x.cash)&&Number.isFinite(x.stock)).map(x=>({symbol,title:`除權息・現金股利 ${x.cash} 元・股票股利 ${x.stock} 股`,source:'Public_Data・股利事件',url:null,publishedAt:`${x.date}T00:00:00Z`,category:'dividends'})),sourceDate};
  };
  const cutoff=new Date(`${taipeiDay()}T00:00:00+08:00`);cutoff.setUTCDate(cutoff.getUTCDate()-30);const cutoffDay=cutoff.toISOString().slice(0,10);
  let items=[],failures=[],staleSources=[],coverageGaps=[],sourceDate=null;
  try{
   if(selected==='news'){
    const result=await cached(`news:${symbol}`,loadNews);items=result.items;failures=result.failures;coverageGaps=result.gaps;sourceDate=result.sourceDate;
   }else if(selected==='all'){
    const results=await Promise.allSettled([cached(`news:${symbol}`,loadNews),cached(`announcements:${symbol}`,loadAnnouncements),cached(`dividends:${symbol}`,loadDividends)]);
    for(const [index,result] of results.entries()){
     if(result.status==='rejected'){failures.push(index===0?'Public_Data 個股新聞':'Public_Data 官方資料');continue;}
     items.push(...result.value.items);if(result.value.sourceDate&&(!sourceDate||result.value.sourceDate>sourceDate))sourceDate=result.value.sourceDate;
     if(index===0){failures.push(...result.value.failures);coverageGaps.push(...result.value.gaps);}
     if(index>0&&result.value.sourceDate&&result.value.sourceDate<cutoffDay)staleSources.push(index===1?`公司公告 ${result.value.sourceDate}`:`除權息 ${result.value.sourceDate}`);
    }
   }else if(selected==='dividends'){
    const result=await cached(`dividends:${symbol}`,loadDividends);items=result.items;sourceDate=result.sourceDate;
   }else{
    const result=await cached(`announcements:${symbol}`,loadAnnouncements);const kind=selected==='other'?'other':selected;items=result.items.filter(x=>x.category===kind);sourceDate=result.sourceDate;
   }
  }catch(error){failures=['Public_Data 資料',error.message];}
  if(!allowed())return ctx.status('上市資格已過期','請同步資料後重新載入新聞。');
  const today=taipeiDay(),newsCutoff=new Date(`${today}T00:00:00+08:00`);newsCutoff.setUTCDate(newsCutoff.getUTCDate()-7);const newsCutoffDay=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(newsCutoff);const recent=items.filter(item=>{const day=item.publishedAt?.slice(0,10),cutoff=item.category==='news'?newsCutoffDay:cutoffDay;return day&&day>=cutoff&&day<=today;}).sort((a,b)=>(b.publishedAt||'').localeCompare(a.publishedAt||''));
  const date=(value,dateOnly=false)=>value?new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',dateStyle:'medium',...(dateOnly?{}:{timeStyle:'short'})}).format(new Date(value)):'發布日期不足';
  const label=categories.find(([id])=>id===selected)?.[1]??'新聞';let html=ctx.card(`${name} ${symbol}・新聞與事件`,`${toolbar}<p>新聞保留最近 7 日；公告與除權息依來源保留最近 30 日。點選標題直接開啟來源頁面。</p><p role="status">${label}・取得 ${recent.length} 則，最新來源日 ${e(sourceDate??'日期不足')}。</p><button data-action="reload">重新載入</button>`);
  if(failures.length)html+=ctx.card('Public_Data 來源無法載入',`<p>${failures.map(e).join('、')}</p><p>目前結果不代表來源完整；請稍後重新載入。</p>`);
  if(coverageGaps.length)html+=ctx.card('Public_Data 資料缺口',`<p>${coverageGaps.map(e).join('、')}；不會直接向外部新聞網站補資料。</p>`);
  if(staleSources.length)html+=ctx.card('部分官方來源已過期',`<p>${staleSources.map(e).join('、')}；不把過期來源資料列作近期事件。</p>`);
  if(selected!=='news'&&sourceDate&&sourceDate<cutoffDay)html+=ctx.card('來源資料已超過 30 日',`<p>Public_Data 最新可用日期為 ${e(sourceDate)}；不把過期公告或股利資料列作近期事件。</p>`);
  if(!recent.length)html+=ctx.status(failures.length?'來源暫不可用':'所選期間沒有可驗證項目',selected==='news'?'Public_Data 尚未提供可驗證的個股新聞資料；不以外部來源代填。':'資料不足不等同於沒有公司事件。');
  const grouped=new Map();for(const item of recent){const day=item.publishedAt?.slice(0,10)??'日期不足';grouped.set(day,[...(grouped.get(day)??[]),item]);}
  html+=[...grouped].map(([day,dayItems])=>ctx.card(day,dayItems.map(item=>`<article class="rebuild-news-item"><a class="directory-link rebuild-news-title" href="${e(item.url)}" target="_blank" rel="noopener noreferrer">${e(item.title)} ↗</a><p class="source">${e(name)} ${e(symbol)}・${e(item.source)}・${e(date(item.publishedAt,item.source.startsWith('Public_Data')))}</p></article>`).join(''))).join('');
  return html;
 }
 return {page};
}
