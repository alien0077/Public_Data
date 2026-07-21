import { api } from '../api.js';
import { db } from '../db.js';
import { CorporateActions } from '../corporateActions.js';

export const Dashboard = {
    async init() {
        console.log('Dashboard: Initializing UI structure...');
        const container = document.getElementById('view-dashboard');
        if (!container) return;

        container.innerHTML = `
            <div class="p-4 md:p-6 space-y-8 flex-1 overflow-y-auto no-scrollbar">
                <!-- Market Summary -->
                <div class="grid grid-cols-1 md:grid-cols-3 gap-6" id="dashboard-market-stats">
                    <div class="bg-white dark:bg-[#161b22] p-6 rounded-2xl border border-gray-200 dark:border-gray-800 animate-pulse">
                        <div class="h-4 w-24 bg-gray-200 dark:bg-gray-800 rounded mb-4"></div>
                        <div class="h-8 w-32 bg-gray-200 dark:bg-gray-800 rounded"></div>
                    </div>
                    <div class="bg-white dark:bg-[#161b22] p-6 rounded-2xl border border-gray-200 dark:border-gray-800 animate-pulse">
                        <div class="h-4 w-24 bg-gray-200 dark:bg-gray-800 rounded mb-4"></div>
                        <div class="h-8 w-32 bg-gray-200 dark:bg-gray-800 rounded"></div>
                    </div>
                    <div class="bg-white dark:bg-[#161b22] p-6 rounded-2xl border border-gray-200 dark:border-gray-800 animate-pulse">
                        <div class="h-4 w-24 bg-gray-200 dark:bg-gray-800 rounded mb-4"></div>
                        <div class="h-8 w-32 bg-gray-200 dark:bg-gray-800 rounded"></div>
                    </div>
                </div>

                <!-- Main Grid -->
                <div class="grid grid-cols-1 xl:grid-cols-2 gap-8">
                    <!-- Column 1 -->
                    <div class="space-y-8">
                        <div class="bg-white dark:bg-[#161b22] rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
                            <div class="p-5 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
                                <h3 class="font-bold text-gray-900 dark:text-white flex items-center">
                                    <span class="mr-2">⚡</span> 量化模型快覽
                                </h3>
                                <button onclick="router.switchPage('trendHunter')" class="text-xs text-blue-500 font-bold hover:underline">查看詳情</button>
                            </div>
                            <div class="p-6 grid grid-cols-2 gap-4" id="dashboard-quant-summary">
                                <div class="text-center py-4 text-gray-500 text-sm">加載中...</div>
                            </div>
                        </div>

                        <div class="bg-white dark:bg-[#161b22] rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
                            <div class="p-5 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
                                <h3 class="font-bold text-gray-900 dark:text-white flex items-center">
                                    <span class="mr-2">🛡️</span> 風險與回撤
                                </h3>
                                <button onclick="router.switchPage('assetRisk')" class="text-xs text-blue-500 font-bold hover:underline">風險分析</button>
                            </div>
                            <div class="p-6" id="dashboard-risk-summary">
                                <div class="text-center py-4 text-gray-500 text-sm">加載中...</div>
                            </div>
                        </div>
                    </div>

                    <!-- Column 2 -->
                    <div class="space-y-8">
                        <div class="bg-white dark:bg-[#161b22] rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
                            <div class="p-5 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
                                <h3 class="font-bold text-gray-900 dark:text-white flex items-center">
                                    <span class="mr-2">🔥</span> 外資口是心非偵測
                                </h3>
                            </div>
                            <div class="p-5 space-y-4" id="dashboard-liar-summary">
                                <div class="text-center py-4 text-gray-500 text-sm">監控中...</div>
                            </div>
                        </div>

                        <div class="bg-white dark:bg-[#161b22] rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
                            <div class="p-5 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
                                <h3 class="font-bold text-gray-900 dark:text-white flex items-center">
                                    <span class="mr-2">💰</span> 預估配息總覽
                                </h3>
                                <button onclick="router.switchPage('assetRisk', '現金流')" class="text-xs text-blue-500 font-bold hover:underline">現金流</button>
                            </div>
                            <div class="p-6" id="dashboard-dividend-summary">
                                <div class="text-center py-4 text-gray-500 text-sm">計算中...</div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 大盤融資維持率趨勢圖 -->
                <div class="bg-white dark:bg-[#161b22] rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm" id="dashboard-maintenance-chart-card">
                    <div class="p-5 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
                        <h3 class="font-bold text-gray-900 dark:text-white flex items-center">
                            <span class="mr-2">📊</span> 大盤融資維持率
                        </h3>
                        <div class="flex items-center gap-3">
                            <span id="dashboard-mr-current" class="text-sm font-mono font-bold text-blue-500">--</span>
                            <span id="dashboard-mr-status" class="text-[10px] px-2 py-0.5 rounded-full font-bold">--</span>
                        </div>
                    </div>
                    <div class="p-4">
                        <div id="dashboard-maintenance-chart" class="w-full" style="height:320px;"></div>
                    </div>
                </div>
            </div>
        `;

        await this.render();
    },

    async render() {
        console.log('Dashboard: Starting render data fetch...');
        let indexData = null;
        try {
            indexData = await api.fetchLocalJson('index.json');
        } catch (e) {
            console.warn('Dashboard: Could not fetch index.json');
        }

        const latestMargin = indexData?.latest_daily_tw_market_margin || '2026-05-20';
        const indexSymbols = ['IX0001', 'IX0043', '^DJI', '^IXIC', '^GSPC', '^SOX', 'TSM']; 
        
        try {
            const quotesPromise = api.fetchQuotes(indexSymbols).catch(err => { console.error('Dashboard: fetchQuotes failed', err); return {}; });
            const marginPromise = api.fetchLocalJson(`daily/tw_market_margin/${latestMargin}.json`).catch(() => null);
            const liarPromise = api.fetchLocalJson('daily/liar.json').catch(() => null);
            const quantPromise = api.fetchLocalJson('quant/latest_portfolio.json').catch(() => null);
            const tradesPromise = db.getAllTrades().catch(() => []);
            const riskPromise = api.fetchLocalJson('meta/market_risk.json').catch(() => null);
            const narrativePromise = api.fetchLocalJson('meta/market_narrative.json').catch(() => null);
            const marginHistoryPromise = api.fetchLocalJson('meta/market_margin_history.json').catch(() => null);

            const [quotes, marginData, liarData, quantData, trades, riskData, narrativeData, marginHistory] = await Promise.all([
                quotesPromise, marginPromise, liarPromise, quantPromise, tradesPromise, riskPromise, narrativePromise, marginHistoryPromise
            ]);

            this.renderMarket(quotes, marginData);
            this.renderLiar(liarData);
            this.renderQuant(quantData);
            this.renderPortfolioSummary(trades);
            this.renderIntelligence(riskData, narrativeData, marginHistory);

        } catch (err) {
            console.error('Dashboard: Top-level render error', err);
        }
    },

    async getMarketSession(market) {
        const calendar = await api.getCalendar();
        const status = api.getMarketStatus(market === 'TW' ? '2330' : 'AAPL', calendar);
        
        if (!status.isTradingDay || status.session === '休市') {
            return { label: '休市', color: 'bg-gray-700' };
        }
        
        const colors = {
            '未開盤': 'bg-gray-500',
            '盤前': 'bg-orange-500',
            '盤中': 'bg-red-500 animate-pulse',
            '盤後': 'bg-blue-500'
        };

        return { label: status.session, color: colors[status.session] || 'bg-gray-700' };
    },

    renderMarket(quotes, marginData) {
        const container = document.getElementById('dashboard-market-stats');
        if (!container) return;

        const updateMarketUI = async () => {
            const twSession = await this.getMarketSession('TW');
            const usSession = await this.getMarketSession('US');
            
            const existingTwBadge = container.querySelector('#tw-market-badge');
            const existingUsBadge = container.querySelector('#us-market-badge');
            
            if (existingTwBadge) {
                existingTwBadge.textContent = twSession.label;
                existingTwBadge.className = `px-2 py-0.5 rounded text-[10px] text-white font-bold ${twSession.color}`;
            }
            if (existingUsBadge) {
                existingUsBadge.textContent = usSession.label;
                existingUsBadge.className = `px-2 py-0.5 rounded text-[10px] text-white font-bold ${usSession.color}`;
            }
        };

        const formatIdx = (val) => {
            const num = parseFloat(val);
            return isNaN(num) || num === 0 ? '--' : num.toLocaleString(undefined, {minimumFractionDigits: 1, maximumFractionDigits: 1});
        };
        const getPctColor = (pct) => parseFloat(pct || 0) >= 0 ? 'text-red-500' : 'text-green-500';

        const getItem = (sym) => {
            const clean = sym.replace('^', '').toUpperCase();
            const res = quotes[sym] || 
                        quotes['^' + clean] || 
                        quotes[clean] || 
                        (clean === 'IX0001' ? (quotes['TSE'] || quotes['^TWII'] || quotes['TWII']) : null) ||
                        (clean === 'IX0043' ? (quotes['OTC'] || quotes['^TWOII'] || quotes['TWOII']) : null) ||
                        { price: 0, changePercent: 0, source: 'N/A', date: '--' };
            return res;
        };

        const tse = getItem('IX0001');
        const otc = getItem('IX0043');
        const dji = getItem('DJI');
        const nasdaq = getItem('IXIC');
        const sp500 = getItem('GSPC');
        const sox = getItem('SOX');
        const tsm = getItem('TSM');

        const getDateBadge = (item) => {
            if (item.source === 'REALTIME' || item.source === 'REALTIME_CHART') return '<span class="ml-1 animate-pulse text-blue-500">📡</span>';
            if (item.date && item.date !== '--') return `<span class="ml-1 text-[8px] bg-gray-100 dark:bg-gray-800 text-gray-400 px-1 rounded">${item.date.substring(5)}</span>`;
            return '';
        };

        const formatPct = (val) => {
            const num = parseFloat(val);
            if (isNaN(num)) return '0.00';
            return (num >= 0 ? '+' : '') + num.toFixed(2);
        };

        container.innerHTML = `
            <div class="bg-white dark:bg-[#161b22] p-5 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm relative overflow-hidden">
                <div class="flex justify-between items-center mb-4">
                    <span class="text-xs font-bold text-gray-400 uppercase tracking-widest font-sans">台股市場</span>
                    <span id="tw-market-badge" class="px-2 py-0.5 rounded text-[10px] text-white font-bold bg-gray-500">加載中...</span>
                </div>
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <div class="text-[9px] text-gray-500 mb-0.5 flex items-center truncate">加權 ${getDateBadge(tse)}</div>
                        <div class="text-xl font-mono font-bold text-gray-900 dark:text-white">${formatIdx(tse.price)}</div>
                        <div class="${getPctColor(tse.changePercent)} font-mono font-bold text-xs">${formatPct(tse.changePercent)}%</div>
                    </div>
                    <div>
                        <div class="text-[9px] text-gray-500 mb-0.5 flex items-center truncate">櫃買 ${getDateBadge(otc)}</div>
                        <div class="text-xl font-mono font-bold text-gray-900 dark:text-white">${formatIdx(otc.price)}</div>
                        <div class="${getPctColor(otc.changePercent)} font-mono font-bold text-xs">${formatPct(otc.changePercent)}%</div>
                    </div>
                </div>
                <div class="mt-4 pt-3 border-t border-gray-100 dark:border-gray-800 flex justify-between items-center">
                    <span class="text-[10px] text-gray-400 font-bold">市場融資餘額</span>
                    <span class="text-xs font-mono font-bold text-blue-500">${((marginData?.stocks?.[0]?.total_margin_balance || 0) / 100000000).toFixed(0)} 億</span>
                </div>
            </div>

            <div class="bg-white dark:bg-[#161b22] p-5 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm relative lg:col-span-2">
                <div class="flex justify-between items-center mb-4">
                    <span class="text-xs font-bold text-gray-400 uppercase tracking-widest font-sans">美股與半導體監控</span>
                    <span id="us-market-badge" class="px-2 py-0.5 rounded text-[10px] text-white font-bold bg-gray-500">加載中...</span>
                </div>
                <div class="grid grid-cols-2 md:grid-cols-5 gap-3">
                    <div class="p-1 min-w-0">
                        <div class="text-[9px] text-gray-500 mb-0.5 flex items-center truncate">道瓊 ${getDateBadge(dji)}</div>
                        <div class="text-base font-mono font-bold text-gray-900 dark:text-white">${formatIdx(dji.price)}</div>
                        <div class="${getPctColor(dji.changePercent)} text-[10px] font-mono font-bold">${formatPct(dji.changePercent)}%</div>
                    </div>
                    <div class="p-1 min-w-0">
                        <div class="text-[9px] text-gray-500 mb-0.5 flex items-center truncate">標普 ${getDateBadge(sp500)}</div>
                        <div class="text-base font-mono font-bold text-gray-900 dark:text-white">${formatIdx(sp500.price)}</div>
                        <div class="${getPctColor(sp500.changePercent)} text-[10px] font-mono font-bold">${formatPct(sp500.changePercent)}%</div>
                    </div>
                    <div class="p-1 min-w-0">
                        <div class="text-[9px] text-gray-500 mb-0.5 flex items-center truncate">納指 ${getDateBadge(nasdaq)}</div>
                        <div class="text-base font-mono font-bold text-gray-900 dark:text-white">${formatIdx(nasdaq.price)}</div>
                        <div class="${getPctColor(nasdaq.changePercent)} text-[10px] font-mono font-bold">${formatPct(nasdaq.changePercent)}%</div>
                    </div>
                    <div class="bg-blue-500/5 p-1.5 rounded-xl border border-blue-500/10 min-w-0">
                        <div class="text-[10px] text-blue-600 font-bold mb-1 flex items-center text-xs">費半 ${getDateBadge(sox)}</div>
                        <div class="text-base font-mono font-bold text-gray-900 dark:text-white">${formatIdx(sox.price)}</div>
                        <div class="${getPctColor(sox.changePercent)} text-[10px] font-mono font-bold">${formatPct(sox.changePercent)}%</div>
                    </div>
                    <div class="bg-red-500/5 p-1.5 rounded-xl border border-red-500/10 min-w-0">
                        <div class="text-[10px] text-red-600 font-bold mb-1 flex items-center text-xs">台積 ADR ${getDateBadge(tsm)}</div>
                        <div class="text-base font-mono font-bold text-gray-900 dark:text-white">${formatIdx(tsm.price)}</div>
                        <div class="${getPctColor(tsm.changePercent)} text-[10px] font-mono font-bold">${formatPct(tsm.changePercent)}%</div>
                    </div>
                </div>
            </div>
        `;
        
        updateMarketUI();
    },

    async renderLiar(data) {
        const dashboardSummary = document.getElementById('dashboard-liar-summary');
        if (!dashboardSummary) return;

        if (!data || !data.data || data.data.length === 0) {
            dashboardSummary.innerHTML = `<div class="text-center py-4 text-gray-500 text-sm">目前無偵測到說謊事件。</div>`;
            return;
        }

        let stocksMeta = {};
        try {
            const meta = await api.getStocksMeta();
            if (meta && Array.isArray(meta.stocks)) {
                meta.stocks.forEach(s => { stocksMeta[s.symbol] = s.name; });
            }
        } catch(e) {}

        const getStatusBadge = (status) => {
            const map = {
                'LIE': { label: '說謊', color: 'bg-red-500', icon: '🐜' },
                'HONEST': { label: '誠實', color: 'bg-green-500', icon: '✅' },
                'PENDING': { label: '追蹤中', color: 'bg-orange-500', icon: '🕒' }
            };
            const s = map[status] || map['PENDING'];
            return `<span class="${s.color} text-white text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center shadow-sm">
                        <span class="mr-1">${s.icon}</span>${s.label}
                    </span>`;
        };

        const renderCard = (item) => {
            const name = stocksMeta[item.stockId] || stocksMeta[item.stockId.split('.')[0]] || '';
            const isUpgrade = item.sentiment === 'bullish';
            const sentimentColor = isUpgrade ? 'text-red-500' : 'text-green-500';
            return `
                <div class="p-4 bg-white dark:bg-[#161b22] rounded-2xl border border-gray-200 dark:border-gray-800 cursor-pointer hover:border-blue-500/50 transition-all shadow-sm group"
                     data-stock="${item.stockId}"
                     style="min-height:170px; box-sizing:border-box;">
                    <div class="flex justify-between items-start mb-3">
                        <div>
                            <span class="text-[10px] ${isUpgrade ? 'bg-red-500' : 'bg-green-500'} text-white px-2 py-0.5 rounded font-bold uppercase tracking-wider">${item.brokerName}</span>
                            <div class="mt-1 text-xs font-mono font-bold text-gray-900 dark:text-white">${item.stockId} <span class="text-gray-400 font-normal ml-1">${name}</span></div>
                        </div>
                        ${getStatusBadge(item.honestyStatus)}
                    </div>
                    <div class="text-sm font-bold text-gray-800 dark:text-gray-200 line-clamp-2 mb-3 leading-snug h-10 group-hover:text-blue-500 transition-colors">${item.newsTitle}</div>
                    <div class="flex justify-between items-center pt-3 border-t border-gray-100 dark:border-gray-800">
                        <div class="text-center">
                            <div class="text-[8px] text-gray-400 uppercase">目標價</div>
                            <div class="text-sm font-mono font-bold ${sentimentColor}">${item.targetPrice > 0 ? item.targetPrice : '--'}</div>
                        </div>
                        <div class="text-center">
                            <div class="text-[8px] text-gray-400 uppercase">累積進出</div>
                            <div class="text-sm font-mono font-bold ${item.cumulativeVolume >= 0 ? 'text-red-500' : 'text-green-500'}">${item.cumulativeVolume > 0 ? '+' : ''}${Math.round(item.cumulativeVolume)} 張</div>
                        </div>
                    </div>
                </div>
            `;
        };

        const cardsHtml = data.data.map(item => renderCard(item)).join('');
        dashboardSummary.innerHTML = `
            <div id="liar-marquee-wrapper" style="position:relative; overflow:hidden; height:180px;">
                <div id="liar-marquee-track" style="position:absolute; left:0; right:0; transition:transform 0.5s ease-in-out;">
                    ${cardsHtml}
                </div>
            </div>
        `;

        const track = document.getElementById('liar-marquee-track');
        const cards = track.querySelectorAll('[data-stock]');
        let currentIndex = 0;

        cards.forEach((card, i) => {
            card.style.position = 'absolute';
            card.style.left = '0';
            card.style.right = '0';
            card.style.top = `${i * 180}px`;
            card.onclick = () => window.StockDetail.show(card.getAttribute('data-stock'));
        });

        if (cards.length > 0) {
            if (this._liarTimer) clearInterval(this._liarTimer);
            this._liarTimer = setInterval(() => {
                currentIndex = (currentIndex + 1) % cards.length;
                if (track) track.style.transform = `translateY(-${currentIndex * 180}px)`;
            }, 3000);
        }
    },

    renderQuant(data) {
        const container = document.getElementById('dashboard-quant-summary');
        if (!container) return;
        const isBull = data?.regime === 'BULL' || data?.regime === 'AGGRESSIVE';
        container.innerHTML = `
            <div class="text-center border-r border-gray-100 dark:border-gray-800">
                <div class="text-[10px] text-gray-500 mb-1">環境標籤</div>
                <div class="text-xl font-bold ${isBull ? 'text-red-500' : 'text-green-500'}">${data?.regime || '--'}</div>
            </div>
            <div class="text-center">
                <div class="text-[10px] text-gray-500 mb-1">模型淨值 NAV</div>
                <div class="text-xl font-mono font-bold text-blue-500">${data?.nav ? data.nav.toFixed(2) : '--'}</div>
            </div>
        `;
    },

    renderIntelligence(riskData, narrativeData, marginHistory) {
        // 大盤融資維持率 — 當前值 + 歷史趨勢圖
        const mrEl = document.getElementById('dashboard-mr-current');
        const statusEl = document.getElementById('dashboard-mr-status');
        const chartEl = document.getElementById('dashboard-maintenance-chart');
        if (!chartEl) return;

        if (riskData?.stocks?.[0]?.maintenance_rate) {
            const rate = riskData.stocks[0].maintenance_rate;
            const status = riskData.stocks[0].status || '--';
            mrEl.textContent = rate.toFixed(1) + '%';
            statusEl.textContent = status;
            const colors = { '危險': 'bg-red-500', '過熱': 'bg-orange-500', '穩定': 'bg-green-500', '平穩': 'bg-blue-500' };
            statusEl.className = `text-[10px] px-2 py-0.5 rounded-full font-bold text-white ${colors[status] || 'bg-gray-500'}`;
        }

        if (!marginHistory || !marginHistory.history || marginHistory.history.length < 2) return;

        // 過濾有效數據（僅保留有 TAIEX 指數的交易日）
        const validData = marginHistory.history.filter(h => h.index_close > 0 && h.maintenance_rate > 0);

        // 準備 ECharts 數據
        const dates = validData.map(h => h.date.substring(5)); // MM-DD
        const rates = validData.map(h => h.maintenance_rate);
        const indices = validData.map(h => h.index_close);

        // 清理舊實例
        if (this._maintenanceChart) this._maintenanceChart.dispose();

        const chart = echarts.init(chartEl);
        this._maintenanceChart = chart;

        chart.setOption({
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'cross' },
                backgroundColor: 'rgba(22,27,34,0.9)',
                borderColor: '#30363d',
                textStyle: { color: '#e6edf3', fontSize: 11 },
                formatter: function(params) {
                    const p = params[0];
                    const idx = p.dataIndex;
                    const date = validData[idx]?.date || '';
                    const rate = params[0]?.value?.toFixed(2) || '--';
                    const indexVal = params[1]?.value?.toLocaleString() || '--';
                    return `<div style="font-size:12px;font-weight:bold;margin-bottom:4px;">${date}</div>
                            <div style="display:flex;justify-content:space-between;gap:16px;">
                                <span>維持率: <span style="color:#3b82f6;font-weight:bold;">${rate}%</span></span>
                                <span>加權: <span style="color:#f59e0b;font-weight:bold;">${indexVal}</span></span>
                            </div>`;
                }
            },
            legend: {
                data: ['大盤融資維持率', '加權指數'],
                top: 0,
                textStyle: { color: '#8b949e', fontSize: 11 }
            },
            grid: {
                left: '3%',
                right: '4%',
                bottom: '3%',
                top: '15%',
                containLabel: true
            },
            xAxis: {
                type: 'category',
                data: dates,
                axisLine: { lineStyle: { color: '#30363d' } },
                axisLabel: {
                    color: '#8b949e',
                    fontSize: 9,
                    interval: Math.max(0, Math.floor(dates.length / 20) - 1)
                },
                splitLine: { show: false }
            },
            yAxis: [
                {
                    type: 'value',
                    name: '維持率 %',
                    nameTextStyle: { color: '#3b82f6', fontSize: 10 },
                    min: 130,
                    max: 190,
                    axisLine: { lineStyle: { color: '#3b82f6' } },
                    axisLabel: {
                        color: '#3b82f6',
                        fontSize: 10,
                        formatter: '{value}%'
                    },
                    splitLine: {
                        lineStyle: { color: '#21262d', type: 'dashed' }
                    }
                },
                {
                    type: 'value',
                    name: '加權指數',
                    nameTextStyle: { color: '#f59e0b', fontSize: 10 },
                    min: 18000,
                    max: 45000,
                    axisLine: { lineStyle: { color: '#f59e0b' } },
                    axisLabel: {
                        color: '#f59e0b',
                        fontSize: 10,
                        formatter: function(v) { return (v / 1000).toFixed(0) + 'k'; }
                    },
                    splitLine: { show: false }
                }
            ],
            series: [
                {
                    name: '大盤融資維持率',
                    type: 'line',
                    data: rates,
                    smooth: true,
                    symbol: 'none',
                    lineStyle: { width: 2, color: '#3b82f6' },
                    areaStyle: {
                        color: {
                            type: 'linear',
                            x: 0, y: 0, x2: 0, y2: 1,
                            colorStops: [
                                { offset: 0, color: 'rgba(59,130,246,0.3)' },
                                { offset: 1, color: 'rgba(59,130,246,0.02)' }
                            ]
                        }
                    },
                    markLine: {
                        silent: true,
                        data: [
                            { yAxis: 140, label: { formatter: '警戒 140%', color: '#ef4444', fontSize: 9 }, lineStyle: { color: '#ef4444', type: 'dashed', width: 1 } },
                            { yAxis: 160, label: { formatter: '安全 160%', color: '#22c55e', fontSize: 9 }, lineStyle: { color: '#22c55e', type: 'dashed', width: 1 } }
                        ]
                    }
                },
                {
                    name: '加權指數',
                    type: 'line',
                    yAxisIndex: 1,
                    data: indices,
                    smooth: true,
                    symbol: 'none',
                    lineStyle: { width: 1.5, color: '#f59e0b' },
                    areaStyle: {
                        color: {
                            type: 'linear',
                            x: 0, y: 0, x2: 0, y2: 1,
                            colorStops: [
                                { offset: 0, color: 'rgba(245,158,11,0.2)' },
                                { offset: 1, color: 'rgba(245,158,11,0.02)' }
                            ]
                        }
                    }
                }
            ],
            // 深色主題
            backgroundColor: 'transparent'
        });
    },

    async renderPortfolioSummary(trades) {
        const divEl = document.getElementById('dashboard-dividend-summary');
        const riskEl = document.getElementById('dashboard-risk-summary');
        if (!trades || trades.length === 0) {
            if (divEl) divEl.innerHTML = '<div class="text-center py-4 text-gray-500 text-sm">尚無持股數據</div>';
            if (riskEl) riskEl.innerHTML = '<div class="text-center py-4 text-gray-500 text-sm">尚無持股數據</div>';
            return;
        }

        const symbols = Array.from(new Set(trades.map(t => t.symbol || t.stock_id || t.stockId)));
        await CorporateActions.loadCorporateActions(symbols);
        const holdings = CorporateActions.recalculateHoldings(trades);
        const activeSymbols = Object.keys(holdings).filter(sym => holdings[sym].shares > 0.001);

        let estTotalDiv = 0;
        const currentYear = new Date().getFullYear().toString();
        activeSymbols.forEach(sym => {
            const h = holdings[sym];
            const actions = CorporateActions.getActions(sym) || [];
            const monthlyDividends = {};
            for (let m = 1; m <= 12; m++) monthlyDividends[m] = 0;
            actions.forEach(a => {
                if (!a.ex_date) return;
                const [y, m] = a.ex_date.split('-');
                const month = parseInt(m);
                if (isNaN(month) || month < 1 || month > 12) return;
                if ((a.type === 'DIVIDEND' || a.type === 'CASH_DIVIDEND') && a.cash_dividend > 0) {
                    if (y === currentYear) monthlyDividends[month] = a.cash_dividend;
                }
            });
            const histDividends = actions
                .filter(a => a.ex_date && (a.type === 'DIVIDEND' || a.type === 'CASH_DIVIDEND') && a.cash_dividend > 0 && a.ex_date.split('-')[0] !== currentYear)
                .sort((a, b) => b.ex_date.localeCompare(a.ex_date));
            histDividends.forEach(a => {
                const month = parseInt(a.ex_date.split('-')[1]);
                if (month >= 1 && month <= 12 && monthlyDividends[month] === 0) monthlyDividends[month] = a.cash_dividend;
            });
            estTotalDiv += Object.values(monthlyDividends).reduce((sum, dps) => sum + dps * h.shares, 0);
        });

        if (divEl) {
            divEl.innerHTML = `
                <div class="flex items-end space-x-2">
                    <div class="text-4xl font-mono font-bold text-green-500">$${this.formatNumber(estTotalDiv, 0)}</div>
                    <div class="text-xs text-gray-400 mb-2">/ 年預估</div>
                </div>
            `;
        }

        let totalMV = 0;
        const quotes = await api.fetchQuotes(activeSymbols).catch(() => ({}));
        activeSymbols.forEach(sym => {
            const h = holdings[sym];
            totalMV += (quotes[sym]?.price || (h.totalCost / h.shares)) * h.shares;
        });

        let peakMV = parseFloat(localStorage.getItem('twstock_peak_mv') || totalMV);
        if (totalMV > peakMV) { peakMV = totalMV; localStorage.setItem('twstock_peak_mv', peakMV.toString()); }
        const drawdown = peakMV > 0 ? (peakMV - totalMV) / peakMV : 0;

        if (riskEl) {
            riskEl.innerHTML = `
                <div class="flex justify-between items-center mb-4">
                    <div>
                        <div class="text-xs text-gray-500 mb-1 uppercase font-bold">目前回撤</div>
                        <div class="text-3xl font-mono font-bold text-gray-900 dark:text-white">${(drawdown * 100).toFixed(2)}%</div>
                    </div>
                    <div class="text-right">
                        <div class="text-xs text-gray-500 mb-1 uppercase font-bold">歷史最高</div>
                        <div class="text-xl font-mono text-blue-500">$${this.formatNumber(peakMV, 0)}</div>
                    </div>
                </div>
                <div class="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-1.5"><div class="bg-red-500 h-1.5 rounded-full" style="width: ${Math.min(100, drawdown * 400)}%"></div></div>
            `;
        }
    },

    formatNumber(num, decimals = 2) {
        return new Intl.NumberFormat('zh-TW', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(num);
    }
};

window.Dashboard = Dashboard;
