const e=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const number=value=>Number(value).toLocaleString('zh-TW',{minimumFractionDigits:2,maximumFractionDigits:2});
function read(values,key,{positive=false}={}){
 const raw=String(values.get(key)??'').trim();
 if(!raw)return null;
 const value=Number(raw);
 return Number.isFinite(value)&&value>=0&&(!positive||value>0)?value:null;
}
function input(name,label,value='0'){
 return `<label>${label}<input type="number" name="${name}" min="0" step="any" inputmode="decimal" value="${value}" required></label>`;
}
export function calculateInvestment(values){
 const shares=read(values,'shares'),price=read(values,'price');
 if(shares===null||price===null)return '請輸入有效的非負股數與單價。';
 const amount=shares*price;
 if(!Number.isFinite(amount))return '數值超出可計算範圍。';
 return `預估投資金額：${number(amount)} 元`;
}
export function calculateExDividend(values){
 const previous=read(values,'previous',{positive:true}),cash=read(values,'cash'),stock=read(values,'stock'),par=read(values,'par',{positive:true}),subscription=read(values,'subscription'),rights=read(values,'rights');
 if([previous,cash,stock,par,subscription,rights].some(value=>value===null))return '輸入資料無效，請檢查價格、股利與配股率。';
 const numerator=previous-cash+subscription*rights;
 const denominator=1+stock/par+rights;
 if(!Number.isFinite(numerator)||numerator<0||!Number.isFinite(denominator)||denominator<=0)return '輸入資料無效，請檢查價格、股利與配股率。';
 const result=numerator/denominator;
 if(!Number.isFinite(result))return '無法計算參考價，請檢查輸入值。';
 return `試算除權息參考價：${number(result)} 元`;
}
export function calculateDividend(values){
 const shares=read(values,'shares'),perShare=read(values,'perShare'),price=read(values,'price',{positive:true});
 if([shares,perShare,price].some(value=>value===null))return '請輸入有效股數、股利及大於零的股價。';
 const total=shares*perShare,yieldRate=perShare/price*100;
 if(!Number.isFinite(total)||!Number.isFinite(yieldRate))return '數值超出可計算範圍。';
 return `稅前現金股利：${number(total)} 元；參考殖利率：${number(yieldRate)}%`;
}
export function financialToolsMarkup(){
 return `<section class="stack m20-tools" aria-label="財經試算工具">
  <article class="card"><h2>投資金額計算機</h2><form data-financial-tool="investment" class="stack">${input('shares','股數','1000')}${input('price','每股價格（元）','100')}<button class="primary">計算投資金額</button><p class="muted" role="status" aria-live="polite"></p></form><p class="muted">僅計算股數 × 單價的金額，不含手續費、交易稅及零股／成交限制。</p></article>
  <article class="card"><h2>除權息參考價試算</h2><form data-financial-tool="ex-dividend" class="stack">${input('previous','除權息前收盤價（元）','100')}${input('cash','現金股利（元／股）')}${input('stock','股票股利（元／股）')}${input('par','每股面額（元）','10')}${input('subscription','現金增資認購價（元）')}${input('rights','現金增資配股率（股／股）')}<button class="primary">試算參考價</button><p class="muted" role="status" aria-live="polite"></p></form><p class="muted">公式：(前收－現金股利＋認購價×現增配股率) ÷ (1＋股票股利／面額＋現增配股率)。不處理特殊公司行動或價格升降單位取整；實際參考價以證交所公告為準。</p><a href="https://wwwc.twse.com.tw/zh/announcement/ex-right/cal.html" target="_blank" rel="noopener">查看證交所試算說明</a></article>
  <article class="card"><h2>股利試算</h2><form data-financial-tool="dividend" class="stack">${input('shares','持有股數','1000')}${input('perShare','每股現金股利（元）','2')}${input('price','目前股價（元）','100')}<button class="primary">計算股利與殖利率</button><p class="muted" role="status" aria-live="polite"></p></form><p class="muted">現金股利為稅前估算；殖利率＝每股現金股利 ÷ 輸入股價。實際配發、扣繳與入帳以公司公告及券商資料為準。</p></article>
 </section>`;
}
export function calculateFinancialTool(kind,values){
 if(kind==='investment')return calculateInvestment(values);
 if(kind==='ex-dividend')return calculateExDividend(values);
 if(kind==='dividend')return calculateDividend(values);
 return '未知試算工具。';
}
