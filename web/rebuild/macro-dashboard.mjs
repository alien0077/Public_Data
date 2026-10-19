const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num = value => typeof value === 'number' && Number.isFinite(value) ? new Intl.NumberFormat('zh-TW',{maximumFractionDigits:3}).format(value) : '資料不足';
const card = (title, body) => '<section class="card macro-card"><h2>'+esc(title)+'</h2>'+body+'</section>';
const item = (label, value) => '<div class="metric"><small>'+esc(label)+'</small><strong>'+esc(value ?? '資料不足')+'</strong></div>';
const list = (rows, render) => Array.isArray(rows) && rows.length ? rows.map(render).join('') : '<p class="muted">Public_Data 尚未提供此類資料。</p>';
function stale(asOf, quality, now) {
 if(quality?.stale===true||!asOf)return true;
 const source=Date.parse(asOf),current=now instanceof Date?now.getTime():Date.parse(now);
 return !Number.isFinite(source)||!Number.isFinite(current)||current-source>7*86400000;
}
export function renderMacroDashboard(data,now=new Date(),activeTab='overview') {
 const d=data&&typeof data==='object'?data:{},reg=d.macro_regime??{},trade=d.trading_regime??{},analysis=d.analysis??{},risk=d.global_risk??{};
 const tabs=[['overview','總覽'],['indicators','指標'],['risks','風險'],['sectors','產業事件']];
 const selected=tabs.some(([id])=>id===activeTab)?activeTab:'overview';
 const navigation='<nav class="toolbar macro-tabs" role="tablist" aria-label="宏觀資料分頁">'+tabs.map(([id,label])=>'<button type="button" role="tab" data-macro-tab="'+id+'" aria-selected="'+(id===selected)+'" class="'+(id===selected?'primary':'')+'">'+label+'</button>').join('')+'</nav>';
 const old=stale(d.as_of,d.quality,now);
 const metricRows=[item('資料日期',d.as_of||'資料日期不足'),item('宏觀狀態',d.presentation?.regime_zh??reg.state??'資料不足'),item('交易狀態',trade.state??'資料不足'),item('交易狀態分數',num(trade.score)),item('信心度（來源原值）',num(trade.confidence)),item('目標股票曝險（來源原值）',num(trade.target_equity_exposure))].join('');
 const warning=old?'<p class="alert" role="status">來源已標示過期或資料日早於七日；目前只供參考，不代表最新宏觀狀態。</p>':'';
 const factorRows=[['成長',reg.growth_score??reg.growth],['通膨',reg.inflation_score??reg.inflation],['流動性',reg.liquidity_score??reg.liquidity],['利率',reg.rates_score??reg.rates],['匯率',reg.fx_score??reg.fx],['風險',reg.risk_score??reg.risk]].map(([k,v])=>item(k,num(v))).join('');
 const factorDetails=Object.entries(d.presentation?.factors??{}).map(([k,v])=>item(k,[v?.trend,v?.impact].filter(Boolean).join('・')||'資料不足')).join('');
 const indicators=list(d.indicators,x=>'<article class="macro-row"><strong>'+esc(x.name??x.id??'未命名指標')+'</strong><span>資料日：'+esc(x.as_of??d.as_of??'日期不足')+'</span><span>實際 '+esc(num(x.actual))+' '+esc(x.unit??'')+'・前值 '+esc(num(x.previous))+'・預期 '+esc(num(x.consensus))+'</span></article>');
 const drivers=list(d.key_drivers,x=>{if(typeof x==='string')return '<article class="macro-row"><strong>'+esc(x)+'</strong></article>';const href=/^https:\/\//i.test(x?.source_url??'')?'<a href="'+esc(x.source_url)+'" target="_blank" rel="noopener noreferrer">來源報導 ↗</a>':'';return '<article class="macro-row"><strong>'+esc(x?.name??'未命名驅動')+'</strong><p>'+esc(x?.observed??'觀察資料不足')+'</p><p>'+esc(x?.interpretation??'解讀資料不足')+'</p>'+href+'</article>';});
 const risks=list(d.key_risks,x=>'<article class="macro-row">'+esc(x)+'</article>');
 const events=list(risk.active_events,x=>'<article class="macro-row"><strong>'+esc(x.name??x.event_type??'未命名事件')+'</strong><span>區域：'+esc((x.regions??[]).join('、')||'資料不足')+'・嚴重度 '+esc(num(x.severity))+'・信心度 '+esc(num(x.confidence))+'</span></article>');
 const sectors=list(d.sector_tailwinds,x=>'<article class="macro-row"><strong>順風・'+esc(x.name)+'</strong><span>來源分數 '+esc(num(x.score))+'</span></article>')+list(d.sector_headwinds,x=>'<article class="macro-row"><strong>逆風・'+esc(x.name)+'</strong><span>來源分數 '+esc(num(x.score))+'</span></article>');
 const upcoming=list(d.upcoming_events,x=>'<article class="macro-row"><strong>'+esc(x.name??'未命名事件')+'</strong><span>'+esc(x.release_at??'時間未提供')+'・重要度 '+esc(x.importance??'資料不足')+'</span></article>');
 const reason=trade.reason??trade.hysteresis_reason;
 const overview=card('宏觀市場狀態・Public_Data','<div class="metric-grid">'+metricRows+'</div>'+warning+(d.presentation?.stance_zh?'<p>'+esc(d.presentation.stance_zh)+'</p>':'')+(analysis.summary?'<p>'+esc(analysis.summary)+'</p>':'')+(reason?'<p class="muted">狀態原因：'+esc(reason)+'</p>':'')+'<p class="muted">狀態數值依 Public_Data 原始欄位呈現，不另推算配置建議。</p>')+card('宏觀因子・來源分數','<div class="metric-grid">'+factorRows+factorDetails+'</div>');
 const indicatorPage=card('宏觀指標',indicators);
 const riskPage=card('宏觀驅動與風險','<div class="metric-grid">'+item('風險嚴重度（來源原值）',num(risk.severity))+item('信心度（來源原值）',num(risk.confidence))+item('分析信心度（來源原值）',num(analysis.confidence))+'</div>'+drivers+risks+events);
 const sectorPage=card('產業順風／逆風',sectors)+card('近期宏觀事件',upcoming);
 const body={overview,indicators:indicatorPage,risks:riskPage,sectors:sectorPage}[selected];
 return navigation+'<div role="tabpanel" aria-label="'+tabs.find(([id])=>id===selected)[1]+'">'+body+'</div>';
}
