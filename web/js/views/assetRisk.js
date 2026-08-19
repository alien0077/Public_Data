/**
 * Asset & Risk View Module
 * Handles rendering of all Asset & Risk sub-pages
 */
import { db } from '../db.js';
import { api } from '../api.js';
import { CorporateActions } from '../corporateActions.js';
import { stockIdentityHTML } from '../utils/stockListLayout.js';

export const AssetRisk = {
    subPageConfigs: {
        '配置': {
            title: '資產配置分析',
            description: '分析您的持股分佈，包括產業集中度與個股權重。',
            sideTitle: '配置建議',
            sideContent: '多元化配置能有效分散系統性風險。建議單一產業佔比不超過 30%，單一個股佔比不超過 15%。'
        },
        '風險': {
            title: '風險壓力測試',
            description: '評估投資組合在極端市場波動下的潛在回撤與波動率。',
            sideTitle: '指標說明',
            sideContent: '波動率反映了資產價格的變動程度；最大回撤 (MDD) 則顯示了從高點跌落的最深幅度。'
        },
        '現金流': {
            title: '預期現金流',
            description: '基於除權息資訊，預估未來一年的股利收入。',
            sideTitle: '配息提醒',
            sideContent: '殖利率不代表總報酬，應同時關注公司基本面與扣抵稅額相關規範。'
        },
        '績效': {
            title: '績效歸因分析',
            description: '對比大盤指數，分析超額報酬 (Alpha) 的來源。',
            sideTitle: '對標基準',
            sideContent: '通常以台股加權指數 (TAIEX) 或 0050 作為績效對比基準。'
        },
        '模擬': {
            title: '投資組合模擬',
            description: '模擬調整權重後，對整體組合風險與報酬的預期影響。',
            sideTitle: '模擬工具',
            sideContent: '您可以嘗試調高穩健型資產比例，觀察組合夏普值 (Sharpe Ratio) 的變化。'
        }
    },

    init(subPage) {
        console.log('AssetRisk initializing subPage:', subPage);
        const container = document.getElementById('view-assetRisk');
        if (!container) return;

        container.classList.remove('hidden');
        this.renderLayout(container, subPage);
        this.initSubPageLogic(subPage);
    },

    renderLayout(container, subPage) {
        const config = this.subPageConfigs[subPage] || {
            title: subPage,
            description: '模組開發中...',
            sideTitle: '資訊說明',
            sideContent: '數據載入中...'
        };

        container.innerHTML = `
            <div class="flex flex-col space-y-4 mb-6">
                <div class="flex justify-between items-end">
                    <div>
                        <h2 class="text-2xl font-bold text-gray-900 dark:text-white">${config.title}</h2>
                        <p class="text-gray-500 mt-1 text-sm">${config.description}</p>
                    </div>
                    <div class="text-[10px] text-gray-400 font-mono bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded-full">
                        Update: ${new Date().toLocaleDateString()}
                    </div>
                </div>
            </div>

            <div class="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <div class="xl:col-span-2 space-y-6">
                    <div id="asset-risk-main-content" class="bg-white dark:bg-[#161b22] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden min-h-[500px] flex flex-col">
                        ${this.getMainContentPlaceholder(subPage)}
                    </div>
                </div>

                <div class="space-y-6">
                    <div class="bg-white dark:bg-[#161b22] p-6 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm">
                        <h3 class="font-bold text-lg mb-4 flex items-center text-gray-900 dark:text-white">
                            <span class="mr-2">📊</span> ${config.sideTitle}
                        </h3>
                        <div class="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                            ${config.sideContent}
                        </div>
                    </div>

                    <div class="bg-gradient-to-br from-purple-600 to-blue-700 p-6 rounded-2xl text-white shadow-lg shadow-blue-900/20">
                        <h3 class="font-bold mb-2 flex items-center text-white text-sm">
                            <span class="mr-2">🛡️</span> 風險指標
                        </h3>
                        <p class="text-[10px] text-blue-100 mb-4 opacity-80">Portfolio Health Score</p>
                        <div class="flex items-center justify-between">
                            <div class="text-2xl font-bold">健康</div>
                            <div class="text-right">
                                <div class="text-xl font-mono">82</div>
                            </div>
                        </div>
                        <div class="mt-4 h-1.5 bg-blue-900/30 rounded-full overflow-hidden">
                            <div class="h-full bg-white w-[82%] rounded-full shadow-[0_0_10px_rgba(255,255,255,0.5)]"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    getMainContentPlaceholder(subPage) {
        return `
            <div class="flex-1 flex items-center justify-center p-8">
                <div class="text-center">
                    <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
                    <p class="text-gray-500">正在準備數據與圖表...</p>
                </div>
            </div>
        `;
    },

    initSubPageLogic(subPage) {
        const mainContent = document.getElementById('asset-risk-main-content');
        if (!mainContent) return;

        if (subPage === '配置') {
            this.initAllocation(mainContent);
        } else if (subPage === '風險') {
            this.initRisk(mainContent);
        } else if (subPage === '現金流') {
            this.initCashflow(mainContent);
        } else if (subPage === '績效') {
            this.initPerformance(mainContent);
        } else if (subPage === '模擬') {
            this.initSimulation(mainContent);
        }
    },

    baseSymbol(symbol) {
        return String(symbol || '').replace('^', '').split('.')[0].toUpperCase();
    },

    isSymbolLikeName(name, symbol) {
        const value = String(name || '').trim().toUpperCase();
        if (!value) return true;
        const base = this.baseSymbol(symbol);
        return value === base || value === `${base}.TW` || value === `${base}.TWO`;
    },

    resolveStockName(symbol, quote, meta, holding) {
        const candidates = [meta?.name, holding?.name, quote?.name, symbol];
        const resolved = candidates.find(name => !this.isSymbolLikeName(name, symbol));
        return resolved || symbol;
    },

    calculateHoldings(trades) {
        const holdings = {};
        const sortedTrades = [...trades].sort((a, b) => new Date(a.date || a.timestamp || a.tradeDate) - new Date(b.date || b.timestamp || b.tradeDate));

        sortedTrades.forEach(t => {
            const sym = t.symbol || t.stock_id || t.stockId;
            if (!sym) return;
            if (!holdings[sym]) {
                holdings[sym] = { symbol: sym, name: t.name || t.stockName || '', shares: 0, totalCost: 0 };
            }
            const rawType = (t.side || t.type || '').trim().toLowerCase();
            const qty = parseFloat(t.quantity || t.shares || 0);
            const price = parseFloat(t.price || 0);

            if (rawType === '買入' || rawType === '買進' || rawType === 'buy') {
                holdings[sym].shares += qty;
                holdings[sym].totalCost += qty * price;
            } else if (rawType === '賣出' || rawType === 'sell') {
                const avgCostBefore = holdings[sym].shares > 0 ? holdings[sym].totalCost / holdings[sym].shares : 0;
                holdings[sym].shares -= qty;
                holdings[sym].totalCost = holdings[sym].shares * avgCostBefore;
            }
        });
        
        const activeHoldings = {};
        for (const sym in holdings) {
            if (holdings[sym].shares > 0.001) activeHoldings[sym] = holdings[sym];
        }
        return activeHoldings;
    },

    formatNumber(val, decimals = 2) {
        if (val === undefined || val === null || isNaN(val)) return '--';
        return new Intl.NumberFormat('zh-TW', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(val);
    },

    async initAllocation(container) {
        const trades = await db.getAllTrades();
        if (!trades || trades.length === 0) {
            container.innerHTML = `<div class="flex-1 flex items-center justify-center p-8 text-gray-500">暫無持股。</div>`;
            return;
        }
        const holdings = this.calculateHoldings(trades);
        const symbols = Object.keys(holdings);
        const [quotes, stocksMeta] = await Promise.all([
            api.fetchQuotes(symbols).catch(() => ({})),
            api.fetchLocalJson('meta/stocks.json').catch(() => ({ stocks: [] }))
        ]);

        const stockMap = {};
        if (stocksMeta?.stocks) stocksMeta.stocks.forEach(s => {
            const symbol = String(s.symbol || '').toUpperCase();
            const base = this.baseSymbol(symbol);
            [symbol, base, `${base}.TW`, `${base}.TWO`].forEach(key => {
                if (key) stockMap[key] = s;
            });
        });

        let totalMarketValue = 0;
        const processed = symbols.map(sym => {
            const h = holdings[sym];
            const q = quotes[sym] || {};
            const price = q.price || (h.totalCost / h.shares);
            const mv = price * h.shares;
            totalMarketValue += mv;
            const meta = stockMap[String(sym).toUpperCase()] || stockMap[this.baseSymbol(sym)] || {};
            const name = this.resolveStockName(sym, q, meta, h);
            return { symbol: sym, name, shares: h.shares, avgCost: h.totalCost / h.shares, price, marketValue: mv, industry: meta.industry || meta.sector || '其他' };
        });

        processed.sort((a, b) => b.marketValue - a.marketValue);
        container.innerHTML = `
            <div class="p-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50/50 dark:bg-gray-900/50">
                <span class="text-sm font-bold text-gray-900 dark:text-white">持股比例與產業分佈</span>
            </div>
            <div id="allocation-chart-inner" class="w-full min-h-[380px]"></div>
            <div class="border-t border-gray-100 dark:border-gray-800 overflow-x-auto">
                <table class="w-full text-left text-xs font-mono">
                    <thead class="bg-gray-50 dark:bg-gray-900 text-gray-500">
                        <tr><th class="px-6 py-4">個股</th><th class="px-6 py-4">現價/均價</th><th class="px-6 py-4 text-right">市值</th><th class="px-6 py-4 text-right">比例</th></tr>
                    </thead>
                    <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
                        ${processed.map(item => `
                            <tr class="hover:bg-gray-800/30">
                                <td class="px-6 py-4">${stockIdentityHTML(item.symbol, item.name || item.symbol)}</td>
                                <td class="px-6 py-4">${this.formatNumber(item.price)}<br/><span class="text-[10px] text-gray-400">@${this.formatNumber(item.avgCost)}</span></td>
                                <td class="px-6 py-4 text-right font-bold text-blue-500">${this.formatNumber(item.marketValue, 0)}</td>
                                <td class="px-6 py-4 text-right"><span class="px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-600 text-[10px]">${(item.marketValue/totalMarketValue*100).toFixed(2)}%</span></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;

        setTimeout(() => {
            const chartDom = document.getElementById('allocation-chart-inner');
            if (!chartDom) return;
            const isDark = document.documentElement.classList.contains('dark');
            const chartHeight = Math.max(380, Math.min(560, processed.length * 30 + 80));
            chartDom.style.height = `${chartHeight}px`;
            const myChart = echarts.init(chartDom, isDark ? 'dark' : null);
            myChart.setOption({
                backgroundColor: 'transparent',
                tooltip: { trigger: 'item', formatter: '{b}: {d}%' },
                series: [{
                    name: '配置',
                    type: 'pie',
                    radius: ['40%', '67%'],
                    center: ['50%', '50%'],
                    avoidLabelOverlap: true,
                    itemStyle: { borderRadius: 8, borderColor: isDark ? '#161b22' : '#fff', borderWidth: 2 },
                    label: {
                        show: true,
                        position: 'outside',
                        width: 128,
                        overflow: 'breakAll',
                        lineHeight: 14,
                        fontSize: 11,
                        color: isDark ? '#e5e7eb' : '#374151',
                        formatter: params => `${params.name}\n${Number(params.percent).toFixed(2)}%`
                    },
                    labelLine: { show: true, length: 14, length2: 16, smooth: 0.12 },
                    labelLayout: { moveOverlap: 'shiftY', hideOverlap: false },
                    data: processed.map(p => ({ name: `${p.symbol} ${p.name || p.symbol}`, value: p.marketValue }))
                }]
            });
        }, 50);
    },

    async initRisk(container) {
        try {
            const trades = await db.getAllTrades();
            if (!trades || trades.length === 0) {
                container.innerHTML = `<div class="p-8 text-center text-gray-500">暫無交易紀錄，無法進行風險評估。</div>`;
                return;
            }

            const symbols = Array.from(new Set(trades.map(t => t.symbol || t.stock_id || t.stockId)));
            await CorporateActions.loadCorporateActions(symbols);
            const holdings = CorporateActions.recalculateHoldings(trades);
            const activeSymbols = Object.keys(holdings).filter(sym => holdings[sym].shares > 0.001);
            
            if (activeSymbols.length === 0) {
                container.innerHTML = `<div class="p-8 text-center text-gray-500">當前無庫存持股。</div>`;
                return;
            }

            const quotes = await api.fetchQuotes(activeSymbols).catch(() => ({}));
            
            let totalMV = 0;
            const processed = activeSymbols.map(sym => {
                const h = holdings[sym];
                const q = quotes[sym] || {};
                const price = q.price || (h.totalCost / h.shares);
                const mv = price * h.shares;
                totalMV += mv;
                return { symbol: sym, marketValue: mv, beta: 1.0 };
            });

            // Calculate peak equity (mocked with current or from localStorage)
            let peakMV = parseFloat(localStorage.getItem('twstock_peak_mv') || totalMV);
            if (totalMV > peakMV) {
                peakMV = totalMV;
                localStorage.setItem('twstock_peak_mv', peakMV.toString());
            }
            
            const drawdown = peakMV > 0 ? (peakMV - totalMV) / peakMV : 0;
            let riskLevel = 'LOW';
            let riskColor = 'text-green-500';
            if (drawdown > 0.2) { riskLevel = 'EXTREME'; riskColor = 'text-red-600'; }
            else if (drawdown > 0.1) { riskLevel = 'HIGH'; riskColor = 'text-red-500'; }
            else if (drawdown > 0.05) { riskLevel = 'MEDIUM'; riskColor = 'text-yellow-500'; }

            container.innerHTML = `
                <div class="p-6 space-y-8 flex-1 overflow-y-auto">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div class="bg-gray-50 dark:bg-gray-900 p-6 rounded-2xl border border-gray-100 dark:border-gray-800">
                            <h4 class="text-xs font-bold text-gray-400 uppercase mb-4">風險摘要</h4>
                            <div class="flex items-center justify-between">
                                <div>
                                    <div class="text-3xl font-bold ${riskColor}">${riskLevel}</div>
                                    <div class="text-xs text-gray-500 mt-1">目前組合風險等級</div>
                                </div>
                                <div class="text-right">
                                    <div class="text-2xl font-mono font-bold">${(drawdown * 100).toFixed(2)}%</div>
                                    <div class="text-xs text-gray-500 mt-1">目前回撤 (Drawdown)</div>
                                </div>
                            </div>
                        </div>
                        <div class="bg-gray-50 dark:bg-gray-900 p-6 rounded-2xl border border-gray-100 dark:border-gray-800">
                            <h4 class="text-xs font-bold text-gray-400 uppercase mb-4">市場情境模擬</h4>
                            <div class="space-y-3">
                                <div class="flex justify-between text-sm">
                                    <span class="text-gray-500">大盤下跌 -10%</span>
                                    <span class="font-mono font-bold text-red-500">-$${this.formatNumber(totalMV * 0.1, 0)}</span>
                                </div>
                                <div class="flex justify-between text-sm">
                                    <span class="text-gray-500">大盤下跌 -20%</span>
                                    <span class="font-mono font-bold text-red-500">-$${this.formatNumber(totalMV * 0.2, 0)}</span>
                                </div>
                                <div class="flex justify-between text-sm">
                                    <span class="text-gray-500">大盤下跌 -30%</span>
                                    <span class="font-mono font-bold text-red-500">-$${this.formatNumber(totalMV * 0.3, 0)}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="bg-white dark:bg-[#161b22] rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
                        <h4 class="font-bold mb-4 flex items-center">
                            <span class="mr-2">🛡️</span> 風險防禦建議
                        </h4>
                        <p class="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                            ${drawdown > 0.1 ? '組合回撤已超過 10%，建議檢視基本面轉差之持股並適度減碼，增加現金比重。' : '目前組合風險受控，建議維持多元配置並關注個股季報表現。'}
                            集中度分析：${processed.some(p => p.marketValue/totalMV > 0.3) ? '警示！部分個股權重過高 (>30%)，單一事件衝擊風險大。' : '持股權重分佈均勻，具備良好防禦性。'}
                        </p>
                    </div>
                </div>
            `;
        } catch(err) {
            console.error('initRisk failed:', err);
            container.innerHTML = `<div class="p-8 text-center text-red-500">風險評估載入失敗: ${err.message}</div>`;
        }
    },

    async initCashflow(container) {
        try {
            const trades = await db.getAllTrades();
            if (!trades || trades.length === 0) {
                container.innerHTML = `<div class="p-8 text-center text-gray-500">暫無交易紀錄，無法預估現金流。</div>`;
                return;
            }

            const symbols = Array.from(new Set(trades.map(t => t.symbol || t.stock_id || t.stockId)));
            await CorporateActions.loadCorporateActions(symbols);
            const holdings = CorporateActions.recalculateHoldings(trades);
            const activeSymbols = Object.keys(holdings).filter(sym => holdings[sym].shares > 0.001);
            
            if (activeSymbols.length === 0) {
                container.innerHTML = `<div class="p-8 text-center text-gray-500">當前無庫存持股。</div>`;
                return;
            }

            const monthlyDividends = Array(12).fill(0);
            const detailList = [];
            const currentYear = new Date().getFullYear();
            const lastYear = currentYear - 1;
            activeSymbols.forEach(sym => {
                const h = holdings[sym];
                const actions = CorporateActions.getActions(sym);
                const allDividendActions = actions.filter(a => a.ex_date && (a.type === 'DIVIDEND' || a.type === 'CASH_DIVIDEND') && a.cash_dividend > 0)
                    .sort((a, b) => (b.ex_date || '').localeCompare(a.ex_date || ''));
                
                // Select reference year: prefer 2026 > 2025 > most recent available
                const targetYears = new Set([currentYear, lastYear]);
                let refActions = allDividendActions.filter(a => targetYears.has(parseInt(a.ex_date.substring(0, 4))));
                let refYearLabel = null;
                if (refActions.length === 0 && allDividendActions.length > 0) {
                    const mostRecentYear = parseInt(allDividendActions[0].ex_date.substring(0, 4));
                    refActions = allDividendActions.filter(a => parseInt(a.ex_date.substring(0, 4)) === mostRecentYear);
                    refYearLabel = mostRecentYear;
                }

                // Fill each month: prefer current year, then older years
                const monthDiv = {};
                for (let m = 0; m < 12; m++) monthDiv[m] = { cash: 0, year: null, exDate: null, label: null };
                refActions.filter(a => a.ex_date.startsWith(currentYear.toString())).forEach(a => {
                    const m = new Date(a.ex_date).getMonth();
                    monthDiv[m] = { cash: a.cash_dividend, year: currentYear, exDate: a.ex_date, label: '今年已公告' };
                });
                [...refActions].forEach(a => {
                    const m = new Date(a.ex_date).getMonth();
                    if (monthDiv[m].year === null) {
                        const y = parseInt(a.ex_date.substring(0, 4));
                        monthDiv[m] = { cash: a.cash_dividend, year: y, exDate: a.ex_date, label: y === lastYear ? '去年預估' : `${y}年參考` };
                    }
                });

                function getSharesAtDate(sym, targetDateStr) {
                    const targetDate = new Date(targetDateStr);
                    let shares = 0;
                    const sortedTrades = [...trades]
                        .filter(t => (t.symbol || t.stock_id || t.stockId) === sym)
                        .sort((a, b) => new Date(a.date || a.timestamp || a.tradeDate || 0) - new Date(b.date || b.timestamp || b.tradeDate || 0));
                    for (const t of sortedTrades) {
                        const tradeDate = new Date(t.date || t.timestamp || t.tradeDate);
                        if (tradeDate >= targetDate) break;
                        const qty = parseFloat(t.quantity || t.shares || 0);
                        const side = (t.side || t.type || '').toLowerCase();
                        if (side.includes('buy') || side.includes('買')) shares += qty;
                        else if (side.includes('sell') || side.includes('賣')) shares -= qty;
                    }
                    return Math.max(0, shares);
                }

                let estDivPerShare = 0;
                let totalPayout = 0;
                for (let m = 0; m < 12; m++) {
                    const { cash: dps, year, exDate } = monthDiv[m];
                    if (dps === 0 || !year) continue;
                    const isHistorical = year !== currentYear;
                    const sharesToUse = isHistorical ? h.shares : (exDate ? getSharesAtDate(sym, exDate) : 0);
                    monthlyDividends[m] += dps * sharesToUse;
                    estDivPerShare += dps;
                    totalPayout += dps * sharesToUse;
                }

                const hasCurrentYear = refActions.some(a => a.ex_date.startsWith(currentYear.toString()));
                const hasLastYear = refActions.some(a => a.ex_date.startsWith(lastYear.toString()));
                let statusLabel = '歷史參考';
                if (hasCurrentYear) statusLabel = '今年已公告';
                else if (hasLastYear) statusLabel = '去年預估';
                else if (refYearLabel) statusLabel = `${refYearLabel}年參考`;

                const nextExDate = refActions.length > 0 ? refActions[0].ex_date : '--';
                detailList.push({
                    symbol: sym,
                    name: h.name || sym,
                    shares: h.shares,
                    divPerShare: estDivPerShare,
                    totalPayout,
                    isAnnounced: hasCurrentYear,
                    statusLabel,
                    exDate: nextExDate
                });
            });

            const totalAnnualPayout = monthlyDividends.reduce((a, b) => a + b, 0);

            container.innerHTML = `
                <div class="p-6 space-y-6 flex-1 overflow-y-auto">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div class="bg-gradient-to-br from-green-500 to-emerald-700 p-6 rounded-2xl text-white shadow-lg">
                            <div class="text-xs opacity-80 uppercase font-bold tracking-wider mb-2">預估年度總股息</div>
                            <div class="text-4xl font-mono font-bold">$${this.formatNumber(totalAnnualPayout, 0)}</div>
                            <div class="mt-4 text-xs opacity-70">基於當前持股與歷史/公告配息數據推算</div>
                        </div>
                        <div class="bg-white dark:bg-gray-900 p-6 rounded-2xl border border-gray-100 dark:border-gray-800">
                            <div id="cashflow-chart-inner" class="w-full h-40"></div>
                        </div>
                    </div>

                    <div class="bg-white dark:bg-[#161b22] rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                        <table class="w-full text-left text-sm">
                            <thead class="bg-gray-50 dark:bg-gray-900 text-gray-500 text-xs">
                                <tr>
                                    <th class="px-6 py-4">個股</th>
                                    <th class="px-6 py-4 text-right">持有股數</th>
                                    <th class="px-6 py-4 text-right">預估每股股利</th>
                                    <th class="px-6 py-4 text-right font-bold">預估總額</th>
                                    <th class="px-6 py-4 text-center">除權息日</th>
                                    <th class="px-6 py-4 text-center">狀態</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-gray-100 dark:divide-gray-800 font-mono">
                                ${detailList.sort((a,b) => b.totalPayout - a.totalPayout).map(item => `
                                    <tr class="hover:bg-gray-800/30">
                                        <td class="px-6 py-4">${stockIdentityHTML(item.symbol, item.name || item.symbol)}</td>
                                        <td class="px-6 py-4 text-right">${this.formatNumber(item.shares, 0)}</td>
                                        <td class="px-6 py-4 text-right">${this.formatNumber(item.divPerShare)}</td>
                                        <td class="px-6 py-4 text-right font-bold text-green-500">$${this.formatNumber(item.totalPayout, 0)}</td>
                                        <td class="px-6 py-4 text-center font-mono text-gray-600 dark:text-gray-400 text-[11px]">${item.exDate}</td>
                                        <td class="px-6 py-4 text-center">
                                            <span class="px-2 py-0.5 rounded text-[10px] font-bold ${item.statusLabel === '今年已公告' ? 'bg-blue-500/10 text-blue-500' : item.statusLabel === '去年預估' ? 'bg-yellow-500/10 text-yellow-600' : 'bg-gray-500/10 text-gray-500'}">
                                                ${item.statusLabel}
                                            </span>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;

            setTimeout(() => {
                const chartDom = document.getElementById('cashflow-chart-inner');
                if (!chartDom) return;
                const isDark = document.documentElement.classList.contains('dark');
                const myChart = echarts.init(chartDom, isDark ? 'dark' : null);
                myChart.setOption({
                    backgroundColor: 'transparent',
                    grid: { top: 10, bottom: 20, left: 30, right: 10 },
                    xAxis: { type: 'category', data: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'], axisLabel: { fontSize: 9 } },
                    yAxis: { type: 'value', show: false },
                    series: [{ type: 'bar', data: monthlyDividends, itemStyle: { color: '#10b981', borderRadius: [4, 4, 0, 0] } }]
                });
            }, 100);

        } catch(err) {
            console.error('initCashflow failed:', err);
            container.innerHTML = `<div class="p-8 text-center text-red-500">現金流預估載入失敗: ${err.message}</div>`;
        }
    },

    async initPerformance(container) {
        const trades = await db.getAllTrades();
        if (!trades || trades.length === 0) {
            container.innerHTML = `<div class="p-8 text-center text-gray-500">暫無交易紀錄。</div>`;
            return;
        }
        const holdings = this.calculateHoldings(trades);
        const symbols = Object.keys(holdings);
        let totalMV = 0, totalCost = 0;
        const quotes = await api.fetchQuotes(symbols).catch(() => ({}));
        symbols.forEach(sym => {
            const h = holdings[sym];
            const q = quotes[sym] || {};
            const price = q.price || (h.totalCost / h.shares);
            totalMV += price * h.shares;
            totalCost += h.totalCost;
        });
        const totalReturn = totalCost > 0 ? ((totalMV - totalCost) / totalCost * 100) : 0;

        container.innerHTML = `
            <div class="p-6 space-y-8 flex-1 overflow-y-auto">
                <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div class="bg-gray-50 dark:bg-gray-900 p-6 rounded-2xl border border-gray-100 dark:border-gray-800 text-center">
                        <div class="text-[10px] text-gray-500 mb-2 font-bold uppercase">總報酬率</div>
                        <div class="text-2xl font-bold font-mono ${totalReturn >= 0 ? 'text-red-500' : 'text-green-500'}">${totalReturn.toFixed(2)}%</div>
                    </div>
                    <div class="bg-gray-50 dark:bg-gray-900 p-6 rounded-2xl border border-gray-100 dark:border-gray-800 text-center">
                        <div class="text-[10px] text-gray-500 mb-2 font-bold uppercase">大盤對比 (YTD)</div>
                        <div class="text-2xl font-bold font-mono text-blue-500">+15.4%</div>
                    </div>
                    <div class="bg-gray-50 dark:bg-gray-900 p-6 rounded-2xl border border-gray-100 dark:border-gray-800 text-center">
                        <div class="text-[10px] text-gray-500 mb-2 font-bold uppercase">Alpha</div>
                        <div class="text-2xl font-bold font-mono text-purple-500">${(totalReturn - 15.4).toFixed(2)}%</div>
                    </div>
                </div>
                <div id="performance-chart" class="w-full h-80 bg-white dark:bg-[#161b22] rounded-2xl border border-gray-200 dark:border-gray-800 p-4"></div>
            </div>
        `;
        
        setTimeout(() => {
            const chartDom = document.getElementById('performance-chart');
            if (!chartDom) return;
            const isDark = document.documentElement.classList.contains('dark');
            const myChart = echarts.init(chartDom, isDark ? 'dark' : null);
            myChart.setOption({
                backgroundColor: 'transparent',
                tooltip: { trigger: 'axis' },
                xAxis: { type: 'category', data: ['5/1', '5/5', '5/10', '5/15', '5/20'], axisLabel: { color: isDark ? '#8b949e' : '#333' } },
                yAxis: { type: 'value', axisLabel: { color: isDark ? '#8b949e' : '#333' }, splitLine: { lineStyle: { color: isDark ? '#30363d' : '#e0e0e0' } } },
                series: [{ name: '我的投資組合', type: 'line', data: [0, totalReturn*0.3, totalReturn*0.6, totalReturn*0.8, totalReturn], smooth: true, itemStyle: { color: '#ef4444' } }]
            });
        }, 100);
    },

    async initSimulation(container) {
        container.innerHTML = `
            <div class="p-6 space-y-6 flex-1 overflow-y-auto">
                <div class="bg-blue-50 dark:bg-blue-900/10 p-6 rounded-2xl border border-blue-100 dark:border-blue-800/30">
                    <h3 class="text-lg font-bold text-blue-700 dark:text-blue-400 mb-2">📊 投資模擬器</h3>
                    <p class="text-xs text-gray-600 dark:text-gray-400">設定投資金額、期間與預期報酬率，比較單筆投入與定期定額的差異。</p>
                </div>

                <div class="bg-white dark:bg-[#161b22] rounded-2xl border border-gray-200 dark:border-gray-800 p-6 space-y-5">
                    <div class="space-y-4" id="sim-inputs">
                        <div>
                            <label class="text-xs font-bold text-gray-500 block mb-1.5">總投資金額 (元)</label>
                            <input type="text" id="sim-amount" value="1,000,000" class="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3 text-right font-mono text-lg outline-none focus:border-blue-500 text-gray-900 dark:text-white">
                        </div>
                        <div>
                            <label class="text-xs font-bold text-gray-500 block mb-1.5">投資期間 (月)</label>
                            <input type="number" id="sim-months" value="240" class="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3 text-right font-mono text-lg outline-none focus:border-blue-500 text-gray-900 dark:text-white">
                        </div>
                        <div>
                            <label class="text-xs font-bold text-gray-500 block mb-1.5">年化報酬率 (%)</label>
                            <input type="text" id="sim-return" value="7" class="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3 text-right font-mono text-lg outline-none focus:border-blue-500 text-gray-900 dark:text-white">
                        </div>
                        <button id="sim-run-btn" class="w-full bg-blue-600 hover:bg-blue-700 active:scale-95 transition-all p-3 rounded-lg font-bold text-white shadow-lg shadow-blue-900/20">
                            ▶ 開始模擬
                        </button>
                    </div>

                    <div id="sim-results" class="hidden space-y-6 pt-4 border-t border-gray-100 dark:border-gray-800">
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div id="sim-lumpsum" class="bg-gray-50 dark:bg-gray-900/50 p-5 rounded-xl border border-gray-100 dark:border-gray-800"></div>
                            <div id="sim-dca" class="bg-gray-50 dark:bg-gray-900/50 p-5 rounded-xl border border-gray-100 dark:border-gray-800"></div>
                        </div>
                        <div id="sim-annual-breakdown" class="hidden">
                            <h4 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">逐年明細</h4>
                            <div class="overflow-x-auto bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
                                <table class="w-full text-xs text-left">
                                    <thead class="bg-gray-50 dark:bg-gray-800 text-gray-500">
                                        <tr><th class="px-4 py-3">年份</th><th class="px-4 py-3 text-right">年底價值</th><th class="px-4 py-3 text-right">累積投入</th></tr>
                                    </thead>
                                    <tbody id="sim-annual-body" class="divide-y divide-gray-100 dark:divide-gray-800"></tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('sim-run-btn')?.addEventListener('click', () => {
            const rawAmt = (document.getElementById('sim-amount')?.value || '').replace(/,/g, '');
            const amount = parseFloat(rawAmt) || 0;
            const months = parseInt(document.getElementById('sim-months')?.value || '0') || 0;
            const annualRate = (parseFloat(document.getElementById('sim-return')?.value || '0') || 0) / 100;
            if (amount <= 0 || months <= 0) { alert('請輸入有效的金額與期間'); return; }
            const monthlyRate = Math.pow(1 + annualRate, 1 / 12) - 1;
            const n = months;

            // Lump sum
            const lumpSumFinal = amount * Math.pow(1 + monthlyRate, n);
            const lumpSumReturn = lumpSumFinal - amount;
            const lumpSumPct = ((lumpSumFinal / amount) - 1) * 100;

            // DCA (monthly investment)
            const monthlyInvestment = amount / n;
            let dcaFinal = 0;
            for (let i = 0; i < n; i++) {
                dcaFinal += monthlyInvestment * Math.pow(1 + monthlyRate, n - i);
            }
            const dcaTotalInvested = amount;
            const dcaReturn = dcaFinal - dcaTotalInvested;
            const dcaPct = ((dcaFinal / dcaTotalInvested) - 1) * 100;

            const fmt = (v) => '$' + new Intl.NumberFormat('zh-TW', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(v));
            const color = (v) => v >= 0 ? 'text-red-500' : 'text-green-500';

            document.getElementById('sim-lumpsum').innerHTML = '<div class="text-sm font-bold mb-3">單筆投入 (Lump Sum)</div>' +
                '<div class="flex justify-between mb-2"><span class="text-[10px] text-gray-500">最終價值</span><span class="text-base font-bold font-mono">' + fmt(lumpSumFinal) + '</span></div>' +
                '<div class="flex justify-between mb-2"><span class="text-[10px] text-gray-500">總報酬</span><span class="text-sm font-bold font-mono ' + color(lumpSumReturn) + '">' + (lumpSumReturn >= 0 ? '+' : '') + fmt(Math.abs(lumpSumReturn)) + '</span></div>' +
                '<div class="flex justify-between"><span class="text-[10px] text-gray-500">報酬率</span><span class="text-sm font-bold font-mono ' + color(lumpSumReturn) + '">' + lumpSumPct.toFixed(2) + '%</span></div>';

            document.getElementById('sim-dca').innerHTML = '<div class="text-sm font-bold mb-3">定期定額 (DCA)</div>' +
                '<div class="flex justify-between mb-2"><span class="text-[10px] text-gray-500">最終價值</span><span class="text-base font-bold font-mono">' + fmt(dcaFinal) + '</span></div>' +
                '<div class="flex justify-between mb-2"><span class="text-[10px] text-gray-500">總報酬</span><span class="text-sm font-bold font-mono ' + color(dcaReturn) + '">' + (dcaReturn >= 0 ? '+' : '') + fmt(Math.abs(dcaReturn)) + '</span></div>' +
                '<div class="flex justify-between"><span class="text-[10px] text-gray-500">報酬率</span><span class="text-sm font-bold font-mono ' + color(dcaReturn) + '">' + dcaPct.toFixed(2) + '%</span></div>';

            // Annual breakdown (every 12 months)
            const annualBody = document.getElementById('sim-annual-body');
            const annualDiv = document.getElementById('sim-annual-breakdown');
            if (annualBody && annualDiv) {
                annualBody.innerHTML = '';
                for (let y = 1; y <= Math.ceil(n / 12); y++) {
                    const monthsUpToYear = Math.min(y * 12, n);
                    let yearEndValue = 0;
                    let totalInv = 0;
                    for (let i = 0; i < monthsUpToYear; i++) {
                        yearEndValue += monthlyInvestment * Math.pow(1 + monthlyRate, monthsUpToYear - i);
                        totalInv += monthlyInvestment;
                    }
                    const tr = document.createElement('tr');
                    tr.className = 'hover:bg-gray-50 dark:hover:bg-gray-800/30';
                    tr.innerHTML = '<td class="px-4 py-3 font-medium">第 ' + y + ' 年</td>' +
                        '<td class="px-4 py-3 text-right font-bold font-mono">' + fmt(yearEndValue) + '</td>' +
                        '<td class="px-4 py-3 text-right text-gray-500 font-mono">' + fmt(totalInv) + '</td>';
                    annualBody.appendChild(tr);
                }
                annualDiv.classList.remove('hidden');
            }

            document.getElementById('sim-results')?.classList.remove('hidden');
            document.getElementById('sim-results')?.scrollIntoView({ behavior: 'smooth' });
        });

        // Auto-format amount input with commas
        document.getElementById('sim-amount')?.addEventListener('input', function() {
            const raw = this.value.replace(/,/g, '').replace(/[^\d]/g, '');
            if (raw) this.value = parseInt(raw).toLocaleString('zh-TW');
        });
    }
};
