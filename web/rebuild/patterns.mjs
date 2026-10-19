// Port of Core/Indicator/PatternEngine.swift. Data rules only; no legacy UI.
// Current scan: geometry on the final 60 bars, candle/volume rules on final 10.
export const PATTERN_SPEC='native-pattern-engine-current-v1';
export const PATTERN_CATEGORY_TYPES=Object.freeze({
 breakout:new Set(['牛旗','熊旗','上升三角','下降三角','對稱三角','箱型整理','上升楔形','下降楔形','窄幅橫盤','回測均線','趨勢線突破','收復200MA','支撐回測','壓力突破','波動收縮(VCP)','ATR壓縮','向上突破']),
 bottom:new Set(['雙底','三底','頭肩底','V型反轉','圓弧底','打底','杯柄型態','一底比一底高']),
 volume:new Set(['成交量突破','成交量高潮','價量背離','成交量枯竭','吸籌特徵','爆量啟動'])
});
export function filterPatternSignals(signals,category='all'){
 if(!Array.isArray(signals))return [];
 const types=PATTERN_CATEGORY_TYPES[category];return types?signals.filter(signal=>types.has(signal?.type)):signals.slice();
}
const sum=a=>a.reduce((s,x)=>s+x,0), max=(a,k)=>Math.max(...a.map(x=>x[k])), min=(a,k)=>Math.min(...a.map(x=>x[k]));
function atr(rows,period){
 const tr=rows.map((r,i)=>i?Math.max(r.h-r.l,Math.abs(r.h-rows[i-1].c),Math.abs(r.l-rows[i-1].c)):r.h-r.l),out=rows.map(()=>null);
 if(rows.length>=period){out[period-1]=sum(tr.slice(0,period))/period;for(let i=period;i<rows.length;i++)out[i]=(out[i-1]*(period-1)+tr[i])/period;}return out;
}
function pivots(rows,key){
 const high=key==='h',out=[];
 for(let i=3;i<rows.length-3;i++){
  const value=rows[i][key];
  if(rows.slice(i-3,i).every(x=>high?x[key]<=value:x[key]>=value)&&rows.slice(i+1,i+4).every(x=>high?x[key]<value:x[key]>value))out.push({index:i,value,date:rows[i].date});
 }return out;
}
export function detectPatterns(bars,symbol){
 if(bars.length<60)throw Error('型態引擎需要至少60筆完整行情');
 const rows=bars.map(b=>({date:b.date,o:b.open*b.adjusted/b.close,h:b.high*b.adjusted/b.close,l:b.low*b.adjusted/b.close,c:b.adjusted,v:b.volume}));
 if(rows.some(r=>![r.o,r.h,r.l,r.c,r.v].every(Number.isFinite)||Math.min(r.o,r.h,r.l,r.c)<=0))throw Error('還原 OHLC 無效');
 for(const p of [5,10,20,60,120,240])for(let i=0;i<rows.length;i++)rows[i]['ma'+p]=i+1>=p?sum(rows.slice(i-p+1,i+1).map(r=>r.c))/p:null;
 const a14=atr(rows,14);rows.forEach((r,i)=>{r.atr=a14[i];r.change=i?r.c/rows[i-1].c-1:0;});
 const signals=[];
 function add(type,confidence,stage,date,points=[]){signals.push({id:`${symbol}_${type}_${date}`,type,confidence,stage,date,points});}
 const recent=rows.slice(-60),last=recent.at(-1),prev=recent.at(-2),date=last.date,highs=pivots(recent,'h'),lows=pivots(recent,'l');
 const pair=(p,fn)=>{if(p.length>=2)fn(p.at(-2),p.at(-1));},triple=(p,fn)=>{if(p.length>=3)fn(p.at(-3),p.at(-2),p.at(-1));};
 pair(lows,(a,b)=>{if(b.index-a.index>8&&Math.abs(a.value-b.value)/a.value<.04&&last.c>max(recent.slice(a.index,b.index+1),'h'))add('雙底',.85,'已突破',date,[a,b]);});
 pair(highs,(a,b)=>{if(b.index-a.index>8&&Math.abs(a.value-b.value)/a.value<.04)add('雙頂',.7,'趨勢反轉',date,[a,b]);});
 triple(lows,(a,b,c)=>{const avg=(a.value+b.value+c.value)/3;if(Math.abs(a.value-avg)/avg<.04&&Math.abs(c.value-avg)/avg<.04)add('三底',.85,'即將突破',date,[a,b,c]);if(b.value<a.value&&b.value<c.value&&Math.abs(a.value-c.value)/a.value<.1)add('頭肩底',.85,'建構中',date,[a,b,c]);});
 triple(highs,(a,b,c)=>{if(Math.abs(a.value-c.value)/a.value<.04)add('三頂',.8,'趨勢反轉',date,[a,b,c]);if(b.value>a.value&&b.value>c.value&&Math.abs(a.value-c.value)/a.value<.1)add('頭肩頂',.85,'趨勢反轉',date,[a,b,c]);});
 const ten=recent.slice(-10),thirty=recent.slice(-30),low10=min(ten,'l'),bottom=min(thirty,'l'),top=max(thirty,'h');
 if((ten[0].h-low10)/low10>.08&&(last.c-low10)/low10>.07)add('V型反轉',.7,'趨勢反轉',date);
 if(thirty[0].c>bottom*1.1&&last.c>bottom*1.1)add('圓弧底',.6,'建構中',date);
 if(thirty[0].c<top*.9&&last.c<top*.9)add('圓弧頂',.6,'趨勢反轉',date);
 if(last.l>prev.h*1.01)add('島狀反轉',.8,'趨勢反轉',date);
 if(prev.c<prev.o&&last.o>prev.o&&last.c>last.o||prev.c>prev.o&&last.o<prev.o&&last.c<last.o)add('跳空反轉',.7,'趨勢反轉',date);
 if((max(ten,'h')-low10)/low10<.04)add('窄幅橫盤',.8,'盤整中',date);
 if(last.ma20!==null&&last.l<=last.ma20&&last.c>last.ma20)add('回測均線',.75,'回測中',date);
 const fifteen=recent.slice(-15),poleHigh=max(fifteen,'h'),poleLow=min(fifteen,'l');
 if((poleHigh-fifteen[0].l)/fifteen[0].l>.12&&(poleHigh-last.c)/poleHigh<.08)add('牛旗',.8,'趨勢延續',date);
 if((fifteen[0].h-poleLow)/fifteen[0].h>.12&&(last.c-poleLow)/poleLow<.08)add('熊旗',.8,'趨勢延續',date);
 if(highs.length>=2&&lows.length>=2){
  const h1=highs.at(-1).value,h2=highs.at(-2).value,l1=lows.at(-1).value,l2=lows.at(-2).value;
  if(Math.abs(h1-h2)/h1<.03&&Math.abs(l1-l2)/l1<.03)add('箱型整理',.7,'盤整中',date);
  if(Math.abs(h1-h2)/h1<.02&&l1>l2)add('上升三角',.75,'建構中',date);
  if(Math.abs(l1-l2)/l1<.02&&h1<h2)add('下降三角',.75,'建構中',date);
  if(h1<h2&&l1>l2)add('對稱三角',.7,'建構中',date);
  if(h1>h2&&l1>l2&&h1-h2<l1-l2)add('上升楔形',.7,'趨勢反轉',date);
  if(h1<h2&&l1<l2&&Math.abs(h1-h2)<Math.abs(l1-l2))add('下降楔形',.7,'趨勢反轉',date);
 }
 const forty=recent.slice(-40),low40=min(forty,'l'),fifty=recent.slice(-50),cup=fifty.slice(0,35),handle=fifty.slice(-15),cupHigh=max(cup,'h'),cupLow=min(cup,'l');
 if((max(forty,'h')-low40)/low40<.15&&(last.ma60??0)>low40)add('打底',.7,'建構中',date);
 if((cupHigh-cupLow)/cupLow>.2&&max(handle,'h')<=cupHigh)add('杯柄型態',.8,'即將突破',date);
 if(atr(recent,20).at(-1)<atr(recent,60).at(-1)*.65)add('波動收縮(VCP)',.85,'即將突破',date);
 triple(lows,(a,b,c)=>{if(c.value>b.value&&b.value>a.value)add('一底比一底高',.6,'建構中',date);});
 triple(highs,(a,b,c)=>{if(c.value<b.value&&b.value<a.value)add('一頂比一頂低',.6,'建構中',date);});
 pair(highs,(a,b)=>{if(a.value>b.value&&last.c>b.value)add('趨勢線突破',.75,'已突破',date);});
 if(highs.length&&last.c>highs.at(-1).value)add('壓力突破',.8,'已突破',date);
 if(last.ma60!==null&&Math.abs(last.l-last.ma60)/last.ma60<.015&&last.c>last.o)add('支撐回測',.7,'回測中',date);
 const longMA=last.ma240??last.ma120;
 if(longMA!==null&&last.c>longMA&&prev.c<longMA)add('收復200MA',.8,'已突破',date);
 // Preserve the native engine's current rule, which uses MA240 then MA120.
 for(let i=rows.length-10;i<rows.length;i++){
  const r=rows[i],p=rows[i-1],p2=rows[i-2],d=r.date,body=Math.abs(r.c-r.o),upper=r.h-Math.max(r.c,r.o),lower=Math.min(r.c,r.o)-r.l;
  if(p2.c<p2.o&&Math.abs(p.c-p.o)<(p2.o-p2.c)*.3&&r.c>r.o&&r.c>(p2.o+p2.c)/2)add('晨星',.8,'趨勢反轉',d);
  if(r.c>p.o&&r.o<p.c&&r.c>r.o&&p.c<p.o)add('多頭吞噬',.7,'趨勢反轉',d);
  if(lower>body*2&&upper<body*.5)add('槌頭',.65,'趨勢反轉',d);
  if(upper>body*2&&lower<body*.5)add('射擊之星',.65,'趨勢反轉',d);
  if(p2.c>p2.o&&Math.abs(p.c-p.o)<(p2.c-p2.o)*.3&&r.c<r.o&&r.c<(p2.o+p2.c)/2)add('暮星',.8,'趨勢反轉',d);
  if(r.c>p.c&&p.c>p2.c&&r.c>r.o&&p.c>p.o&&p2.c>p2.o)add('三紅兵',.85,'趨勢延續',d);
  if(r.c<p.c&&p.c<p2.c&&r.c<r.o&&p.c<p.o&&p2.c<p2.o)add('三隻烏鴉',.85,'趨勢延續',d);
  if(r.c<p.o&&r.o>p.c&&r.c<r.o&&p.c>p.o)add('空頭吞噬',.7,'趨勢反轉',d);
  const previous=rows.slice(Math.max(0,i-19),i),avg=sum(previous.map(x=>x.v))/previous.length;
  if(r.v>avg*2.5&&r.c>r.o)add('成交量突破',.75,'已突破',d);
  if(r.v>avg*3&&r.change>.03)add('爆量啟動',.8,'已突破',d);
  if(r.v>avg*5)add('成交量高潮',.9,'延伸過遠',d);
  if(r.v<avg*.4)add('成交量枯竭',.7,'盤整中',d);
  const oldATR=rows[Math.max(0,i-49)].atr;
  if(r.atr!==null&&oldATR!==null&&r.atr/oldATR<.65)add('ATR壓縮',.7,'即將突破',d);
  if(r.ma60!==null&&r.ma5>r.ma20&&r.ma20>r.ma60&&r.c>r.ma5)add('多頭排列',.6,'趨勢中',d);
  if(r.ma60!==null&&r.ma5<r.ma20&&r.ma20<r.ma60&&r.c<r.ma5)add('空頭排列',.6,'趨勢中',d);
  if(p.c>p.o&&r.c<p.o&&r.v>avg)add('假突破',.7,'趨勢反轉',d);
 }
 return [...new Map(signals.map(s=>[s.id,s])).values()].sort((a,b)=>b.date.localeCompare(a.date));
}
