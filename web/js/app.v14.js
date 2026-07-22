import { db } from './db.js';
import { api } from './api.js';
import { charts } from './charts.js';
import { TrendHunter } from './views/trendHunter.v5.js?v=7';
import { AssetRisk } from './views/assetRisk.js?v=2';
import { StockDetail } from './views/stockDetail.js?v=7';
import { BattleRecord } from './views/battleRecord.js?v=2';
import { Transaction } from './views/transaction.js?v=2';
import { Favorites } from './views/favorites.js?v=3';
import { router } from './router.js';
import { CorporateActions } from './corporateActions.js';
import { Settings } from './views/settings.js?cb=3';
import { GroupSearch } from './views/groupSearch.js?v=5';
import { AudioSummary } from './views/audioSummary.js';
import { MarginRankings } from './views/marginRankings.js';
import { getPriceChangeStyle } from './utils/priceStyle.js';
import { stockIdentityHTML, stockMetricHTML, stockMobileCardHTML } from './utils/stockListLayout.js';

const audioSummary = new AudioSummary();

document.addEventListener('DOMContentLoaded', () => {
    const portfolioBody = document.getElementById('portfolio-body');
    const emptyState = document.getElementById('empty-state');
    const manualRefreshBtn = document.getElementById('manual-refresh');
    const clearPortfolioBtn = document.getElementById('clear-portfolio');

    const totalMarketValueEl = document.getElementById('total-market-value');
    const totalPnlEl = document.getElementById('total-pnl');
    const totalPnlPercentEl = document.getElementById('total-pnl-percent');
    const dailyPnlEl = document.getElementById('daily-pnl');

    const stockDetailOverlay = document.getElementById('stock-detail');
    const closeDetailBtn = document.getElementById('close-detail');
    const themeToggleBtn = document.getElementById('theme-toggle');
    const betaWarningEl = document.getElementById('beta-warning');
    const betaTextEl = document.getElementById('beta-text');

    let currentQuotes = {};
    let refreshInterval = null;
    let currentSort = { key: 'name', asc: true };
    let lastTrades = [];
    let lastHoldings = {};

    function updateApiStatus(status, isError = false, source = 'OFFLINE') {
        const indicator = document.getElementById('status-indicator');
        const text = document.getElementById('status-text');
        const sourceBadge = document.getElementById('data-source-badge');
        if (!indicator || !text) return;
        text.textContent = status;
        indicator.className = 'w-1.5 h-1.5 rounded-full mr-2 ' + (isError ? 'bg-red-500 animate-pulse' : 'bg-green-500');
        if (sourceBadge) {
            sourceBadge.textContent = source;
            sourceBadge.className = 'px-2 py-0.5 rounded-full font-bold ' + (source.includes('REALTIME') ? 'bg-green-500/10 text-green-500' : 'bg-gray-200 dark:bg-gray-800 text-gray-500');
        }
    }

    if (themeToggleBtn) themeToggleBtn.addEventListener('click', () => window.ThemeEngine.toggle());
    try {
        router.init();
    } catch (e) { console.error('Router init failed', e); }

    window.addEventListener('router:changed', (e) => {
        const { primary, secondary } = e.detail;
        if (stockDetailOverlay) stockDetailOverlay.classList.add('hidden');
        try {
        if (primary === 'trendHunter') TrendHunter.init(secondary);
        else if (primary === 'assetRisk') AssetRisk.init(secondary);
        else if (primary === 'marginRankings') MarginRankings.show(document.getElementById('view-marginRankings'));
            else if (primary === 'performance') BattleRecord.init();
            else if (primary === 'addTrade') Transaction.init();
            else if (primary === 'favorites') Favorites.init(secondary);
            else if (primary === 'groupSearch') GroupSearch.init();
            else if (primary === 'audioSummary') audioSummary.init();
            else if (primary === 'settings') Settings.init();
        } catch (err) { console.error(primary + ' view error:', err); }
    });

    window.addEventListener('twstock:data-changed', () => init());

    const bindPage = (id, p) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', (e) => { e.preventDefault(); router.switchPage(p); });
    };
    ['portfolio', 'trendHunter', 'marginRankings', 'assetRisk', 'performance', 'addTrade', 'favorites', 'audioSummary', 'groupSearch', 'settings'].forEach(p => {
        bindPage('nav-' + p, p);
        const m = document.getElementById('mobile-nav-' + p);
        if (m) m.addEventListener('click', (e) => { e.preventDefault(); router.switchPage(p); });
    });

    const triggerImportBtn = document.getElementById('trigger-import');
    const importJsonInput = document.getElementById('import-json');
    if (triggerImportBtn && importJsonInput) {
        const hImp = () => importJsonInput.click();
        triggerImportBtn.addEventListener('click', hImp);

        importJsonInput.addEventListener('change', async (event) => {
            const file = event.target.files[0]; if (!file) return;
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    // 🚀 v4.1.1: Prefer 'transactions' master list over 'normalizedTrades' cache
                    let trades = Array.isArray(data.transactions) ? data.transactions : (Array.isArray(data.normalizedTrades) ? data.normalizedTrades : (Array.isArray(data) ? data : []));
                    if (trades.length > 0) {
                        await db.saveTrades(trades);
                        alert('成功匯入 ' + trades.length + ' 筆紀錄！');
                        currentQuotes = {}; await init(); await refreshQuotes();
                    } else alert('找不到交易紀錄。');
                } catch (err) { alert('解析 JSON 失敗。'); }
            };
            reader.readAsText(file);
        });
    }

    manualRefreshBtn && manualRefreshBtn.addEventListener('click', () => refreshQuotes());
    clearPortfolioBtn && clearPortfolioBtn.addEventListener('click', async () => {
        if (confirm('確定要清空持股紀錄嗎？')) {
            await db.clearAllTrades(); alert('已清空'); await init();
        }
    });
    closeDetailBtn && closeDetailBtn.addEventListener('click', () => stockDetailOverlay.classList.add('hidden'));

    const dividendDetailOverlay = document.getElementById('dividend-detail');
    const closeDividendBtn = document.getElementById('close-dividend-detail');
    closeDividendBtn && closeDividendBtn.addEventListener('click', () => dividendDetailOverlay.classList.add('hidden'));
    document.getElementById('dividend-estimate')?.addEventListener('click', () => {
        if (dividendDetailOverlay) {
            renderDividendDetail();
            dividendDetailOverlay.classList.remove('hidden');
        }
    });

    function getSharesAtDate(symbol, targetDateStr) {
        const targetDate = new Date(targetDateStr);
        let shares = 0;
        const sortedTrades = [...lastTrades]
            .filter(t => (t.symbol || t.stock_id || t.stockId) === symbol)
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

    function renderDividendDetail() {
        const body = document.getElementById('dividend-detail-body');
        if (!body) return;
        const symbols = Object.keys(lastHoldings).filter(s => s !== 'yearlyStats' && lastHoldings[s].shares > 0.001);
        if (symbols.length === 0) {
            body.innerHTML = '<div class="text-center text-gray-500 py-12">暫無持股資料</div>';
            return;
        }
        const currentYear = new Date().getFullYear();
        const lastYear = currentYear - 1;

        const rows = symbols.map(sym => {
            const h = lastHoldings[sym];
            const actions = CorporateActions.getActions(sym) || [];
            const allDividendActions = actions
                .filter(a => a.ex_date && (a.type === 'DIVIDEND' || a.type === 'CASH_DIVIDEND') && a.cash_dividend > 0)
                .sort((a, b) => (b.ex_date || '').localeCompare(a.ex_date || ''));

            // Select reference year: 2026 > 2025 > most recent available
            let refDividendActions = allDividendActions.filter(a => {
                const y = parseInt(a.ex_date.substring(0, 4));
                return y === currentYear || y === lastYear;
            });
            if (refDividendActions.length === 0 && allDividendActions.length > 0) {
                const mostRecentYear = parseInt(allDividendActions[0].ex_date.substring(0, 4));
                refDividendActions = allDividendActions.filter(a => parseInt(a.ex_date.substring(0, 4)) === mostRecentYear);
            }

            // Month-by-month: prefer current year, fallback to older years
            const monthMap = {};
            for (let m = 1; m <= 12; m++) monthMap[m] = null;

            refDividendActions.filter(a => a.ex_date.startsWith(currentYear.toString())).forEach(a => {
                const m = new Date(a.ex_date).getMonth() + 1;
                monthMap[m] = { ...a, sourceYear: currentYear, label: '今年已公告' };
            });
            refDividendActions.forEach(a => {
                const m = new Date(a.ex_date).getMonth() + 1;
                if (!monthMap[m]) {
                    const y = parseInt(a.ex_date.substring(0, 4));
                    monthMap[m] = { ...a, sourceYear: y, label: y === lastYear ? '去年預估' : `${y}年參考` };
                }
            });

            const refActions = Object.values(monthMap).filter(Boolean)
                .sort((a, b) => a.ex_date.localeCompare(b.ex_date));

            let totalPayout = 0;
            let totalDivPerShare = 0;
            let hasCurrentYear = false;
            const actionDetails = refActions.map(a => {
                if (a.sourceYear === currentYear) hasCurrentYear = true;
                const sharesAtDate = getSharesAtDate(sym, a.ex_date);
                totalDivPerShare += a.cash_dividend;
                const amount = sharesAtDate * a.cash_dividend;
                totalPayout += amount;
                return { ...a, sharesAtDate, amount };
            });

            return {
                symbol: sym, name: h.name || sym, shares: h.shares,
                divPerShare: totalDivPerShare, totalPayout,
                actions: actionDetails, hasCurrentYear
            };
        }).filter(r => r.actions.length > 0).sort((a, b) => b.totalPayout - a.totalPayout);

        if (rows.length === 0) {
            body.innerHTML = '<div class="text-center text-gray-500 py-12">尚無股利資料</div>';
            return;
        }

        body.innerHTML = rows.map(r => `
            <div class="bg-white dark:bg-[#161b22] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden mb-4">
                <div class="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50" onclick="window.StockDetail.show('${r.symbol}')">
                    <div>
                        <div class="font-bold text-gray-900 dark:text-white">${r.symbol} ${r.name}</div>
                        <div class="text-xs text-gray-500">目前持有 ${formatNumber(r.shares, 0)} 股</div>
                    </div>
                    <div class="text-right">
                        <div class="text-sm font-bold text-green-500">$${formatNumber(r.totalPayout, 0)}</div>
                        <div class="text-xs text-gray-400">預估 $${formatNumber(r.divPerShare)}/股</div>
                    </div>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full text-left text-xs">
                        <thead class="bg-gray-50 dark:bg-gray-900 text-gray-400">
                            <tr>
                                <th class="px-4 py-2">除權息日</th>
                                <th class="px-4 py-2 text-right">現金股利</th>
                                <th class="px-4 py-2 text-right">當下持股</th>
                                <th class="px-4 py-2 text-right">預估金額</th>
                                <th class="px-4 py-2">類型</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
                            ${r.actions.map(a => `
                                <tr>
                                    <td class="px-4 py-2 font-mono text-gray-600 dark:text-gray-400">${a.ex_date}</td>
                                    <td class="px-4 py-2 text-right font-mono font-bold text-green-500">${a.cash_dividend ? a.cash_dividend.toFixed(2) : '--'}</td>
                                    <td class="px-4 py-2 text-right font-mono text-gray-500">${formatNumber(a.sharesAtDate, 0)}</td>
                                    <td class="px-4 py-2 text-right font-mono font-bold text-green-500">$${formatNumber(a.amount, 0)}</td>
                                    <td class="px-4 py-2"><span class="px-2 py-0.5 rounded text-[10px] font-bold ${a.sourceYear === currentYear ? 'bg-blue-500/10 text-blue-500' : 'bg-yellow-500/10 text-yellow-600'}">${a.label}</span></td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `).join('');
    }

    async function init() {
        try {
            const trades = await db.getAllTrades();
            if (trades.length > 0) {
                const symbols = Array.from(new Set(trades.map(t => t.symbol || t.stock_id || t.stockId)));
                await CorporateActions.loadCorporateActions(symbols);
                emptyState.classList.add('hidden');
                lastTrades = trades;
                await renderPortfolio(trades);
                const ytdRef = await api.fetchYTDRef();
                const h = CorporateActions.recalculateHoldings(trades, true, ytdRef.prices);
                lastHoldings = h;
                renderAssetRow2(trades, h, {});
                renderExchangeRates();
                renderMarketSummary({});
                renderBetaWarning(h);
                renderMarketHealth();
                renderMarketDivergence();
                loadAndRenderLiar();
                renderClosedHoldings(trades);
                startAutoRefresh();
            } else {
                await renderPortfolio([], {});
                await renderExchangeRates();
                await renderMarketSummary({});
                await renderMarketHealth();
                await loadAndRenderLiar();
                await renderMarketDivergence();
                if (portfolioBody.children.length === 0) {
                    portfolioBody.innerHTML = '<tr><td colspan="10" class="px-6 py-10 text-center text-gray-500 font-mono text-sm">尚無持股資料，請由側邊欄「匯入資料」匯入交易紀錄</td></tr>';
                }
            }
            // 🚀 支援從 group-search.html 帶入的 ?symbol=XXX 參數
            const params = new URLSearchParams(window.location.search);
            const symbolParam = params.get('symbol');
            if (symbolParam) {
                setTimeout(() => StockDetail.show(symbolParam), 500);
            }
        } catch (err) { console.error('Init failed:', err); }
    }

    function startAutoRefresh() {
        if (refreshInterval) clearInterval(refreshInterval);
        refreshQuotes();
        refreshInterval = setInterval(refreshQuotes, 60000);
    }

    async function refreshQuotes() {
        const trades = await db.getAllTrades();
        if (trades.length === 0) { updateApiStatus('無持股數據', false, 'IDLE'); return; }
        try {
            updateApiStatus('正在同步報價...', false, 'FETCHING');
            const ytdRef = await api.fetchYTDRef();
            const h = CorporateActions.recalculateHoldings(trades, true, ytdRef.prices);
            const q = await api.fetchQuotes(Object.keys(h).filter(k => k !== 'yearlyStats'));
            currentQuotes = q;
            lastTrades = trades; lastHoldings = h;
            updateApiStatus('報價同步成功', false, Object.values(q).some(x => x.source && x.source.includes('REALTIME')) ? 'REALTIME' : 'OFFLINE');
            renderPortfolio(trades, q);
            renderAssetRow2(trades, h, q);
            renderBetaWarning(h);
            renderExchangeRates();
            renderMarketSummary(q);
            renderMarketHealth();
            renderMarketDivergence();
            loadAndRenderLiar();
            renderClosedHoldings(trades);
        } catch (err) {
            updateApiStatus('同步失敗: ' + err.message, true, 'ERROR');
            renderPortfolio(trades, currentQuotes);
            renderAssetRow2(trades, lastHoldings, currentQuotes);
        }
    }

    async function renderPortfolio(trades, quotes = {}) {
        const ytdRef = await api.fetchYTDRef();
        const holdings = CorporateActions.recalculateHoldings(trades, true, ytdRef.prices);
        portfolioBody.innerHTML = '';
        const portfolioCards = document.getElementById('portfolio-cards');
        if (portfolioCards) portfolioCards.innerHTML = '';
        let totalMV = 0, totalYtdBasis = 0, totalRefMV = 0, totalCost = 0;
        let rows = [];

        const syms = Object.keys(holdings).filter(s => s !== 'yearlyStats' && holdings[s].shares > 0.001);

        const [quantMetrics, healthDataMap, chartDataMap] = await Promise.all([
            api.fetchQuantMetrics().catch(() => ({})),
            Promise.all(syms.map(async (s) => {
                try { const d = await api.fetchHealthData(s); return [s, d]; } catch { return [s, null]; }
            })).then(results => Object.fromEntries(results)),
            Promise.all(syms.map(async (s) => {
                try { const c = await api.fetchChart(s); return [s, c]; } catch { return [s, null]; }
            })).then(results => Object.fromEntries(results))
        ]);

        const supportMap = {};
        syms.forEach(sym => {
            const q = quotes[sym] || quotes[sym.split('.')[0]] || {};
            const price = parseFloat(q.price || 0);
            const chart = chartDataMap[sym];
            if (price > 0 && chart) {
                supportMap[sym] = api.calculateSupportMA(price, chart);
            } else {
                supportMap[sym] = { supportMA: 'X', maBias: null };
            }
        });
        syms.sort((a, b) => {
            const ha = holdings[a], hb = holdings[b];
            const qa = quotes[a] || quotes[a.split('.')[0]] || {};
            const qb = quotes[b] || quotes[b.split('.')[0]] || {};
            const pa = parseFloat(qa.price || 0), pb = parseFloat(qb.price || 0);
            const sha = parseFloat(ha.shares || 0), shb = parseFloat(hb.shares || 0);
            const mva = pa > 0 ? pa * sha : ha.totalCost, mvb = pb > 0 ? pb * shb : hb.totalCost;
            const pnla = pa > 0 ? mva - ha.totalCost : 0, pnlb = pb > 0 ? mvb - hb.totalCost : 0;
            const pcta = (pa > 0 && parseFloat(qa.referencePrice || pa) > 0) ? (pa - parseFloat(qa.referencePrice || pa)) / parseFloat(qa.referencePrice || pa) * 100 : 0;
            const pctb = (pb > 0 && parseFloat(qb.referencePrice || pb) > 0) ? (pb - parseFloat(qb.referencePrice || pb)) / parseFloat(qb.referencePrice || pb) * 100 : 0;
            let va, vb;
            switch (currentSort.key) {
                case 'name': va = a.toLowerCase(); vb = b.toLowerCase(); break;
                case 'price': va = pa; vb = pb; break;
                case 'change': va = pcta; vb = pctb; break;
                case 'pnl': va = pnla; vb = pnlb; break;
                default: va = a.toLowerCase(); vb = b.toLowerCase();
            }
            if (typeof va === 'string') return currentSort.asc ? va.localeCompare(vb) : vb.localeCompare(va);
            return currentSort.asc ? (va - vb) : (vb - va);
        });

        syms.forEach(sym => {
            if (sym === 'yearlyStats') return;
            const h = holdings[sym];
            if (h.shares <= 0.001) return;
            const q = quotes[sym] || quotes[sym.split('.')[0]] || {};
            const price = parseFloat(q.price || 0);
            const refPrice = parseFloat(q.referencePrice || price);
            const shares = parseFloat(h.shares || 0);
            const avgCost = shares > 0 ? (h.totalCost / shares) : 0;
            const mv = price > 0 ? (price * shares) : (avgCost * shares);

            totalMV += mv;
            totalYtdBasis += (h.ytdBasis || h.totalCost);
            totalRefMV += (refPrice > 0 ? (refPrice * shares) : mv);
            totalCost += h.totalCost;

            const pnl = price > 0 ? (mv - h.totalCost) : 0;
            const roi = h.totalCost > 0 ? (pnl / h.totalCost * 100) : 0;
            const pct = (price > 0 && refPrice > 0) ? ((price - refPrice) / refPrice * 100) : 0;

            const style = getPriceChangeStyle(price, refPrice, sym);
            const priceClass = style.bgClass ? style.textClass + ' ' + style.bgClass : style.textClass;

            const row = document.createElement('tr');
            row.className = 'hover:bg-gray-800/30 transition-colors cursor-pointer';
            row.addEventListener('click', () => StockDetail.show(sym));

            const quant = quantMetrics[sym] || {};
            const health = healthDataMap[sym];
            const support = supportMap[sym] || {};
            const healthScore = health?.health_score;

            const adviceClass = quant.advice === 'HOLD' ? 'bg-green-500/20 text-green-400' :
                quant.advice === 'REDUCE' ? 'bg-yellow-500/20 text-yellow-400' :
                quant.advice === 'SELL' ? 'bg-red-500/20 text-red-400' : 'bg-gray-500/20 text-gray-400';
            const adviceBadge = quant.advice ? '<span class="px-1.5 py-0.5 rounded text-[9px] font-bold ' + adviceClass + '">' + quant.advice + '</span>' : '';
            const betaText = quant.beta != null ? '<span class="text-[10px] text-gray-500">β:' + quant.beta.toFixed(1) + '</span>' : '';
            const healthBadge = healthScore != null ? '<span class="px-1.5 py-0.5 rounded text-[9px] font-bold ' + (healthScore >= 65 ? 'bg-green-500/20 text-green-400' : healthScore >= 45 ? 'bg-yellow-500/20 text-yellow-400' : 'bg-red-500/20 text-red-400') + '">' + healthScore + '</span>' : '';
            const chipLabel = quant.chip_label || '';
            const eventAlert = quant.event_alert || '';
            const supportMA = support.supportMA || '';
            const supportMAColor = supportMA.includes('🚀') ? 'text-red-400' : supportMA.includes('💀') ? 'text-green-400' : 'text-blue-400';
            const displayName = h.name || q.name || sym;

            row.innerHTML = '<td class="px-3 md:px-6 py-4">' + stockIdentityHTML(sym, displayName, { badgeHTML: adviceBadge }) + '</td>' +
                '<td class="px-3 md:px-6 py-4 text-center text-xs">' + betaText + '</td>' +
                '<td class="px-3 md:px-6 py-4 text-center">' + healthBadge + '</td>' +
                '<td class="px-3 md:px-6 py-4 text-right ' + priceClass + '">' + (price > 0 ? formatNumber(price) : '--') + '</td>' +
                '<td class="px-3 md:px-6 py-4 text-right ' + priceClass + ' text-xs">' + (price > 0 ? (pct > 0 ? '▲' : (pct < 0 ? '▼' : '')) + ' ' + Math.abs(pct).toFixed(2) + '%' : '--') + '</td>' +
                '<td class="px-3 md:px-6 py-4 text-right">' + formatNumber(shares, 0) + '</td>' +
                '<td class="px-3 md:px-6 py-4 text-right text-gray-400 text-xs">' + formatNumber(avgCost) + '</td>' +
                '<td class="px-3 md:px-6 py-4 text-center"><div class="flex flex-col items-center gap-0.5">' +
                    (chipLabel ? '<span class="text-[10px]">' + chipLabel + '</span>' : '') +
                    (eventAlert ? '<span class="text-[10px] text-yellow-400">' + eventAlert + '</span>' : '') +
                    (supportMA !== 'X' ? '<span class="text-[10px] font-bold ' + supportMAColor + '">' + supportMA + '</span>' : '') +
                '</div></td>' +
                '<td class="px-3 md:px-6 py-4 text-right ' + (pnl >= 0 ? 'text-red-500' : 'text-green-500') + '"><div class="font-bold">' + (pnl >= 0 ? '+' : '') + formatNumber(pnl, 0) + '</div><div class="text-[10px] opacity-70">' + roi.toFixed(2) + '%</div></td>' +
                '<td class="px-3 md:px-6 py-4 text-right"><button class="delete-stock p-2 text-gray-500 hover:text-red-500"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button></td>';

            row.querySelector('.delete-stock').addEventListener('click', (e) => {
                e.stopPropagation();
                deleteStockTrades(sym);
            });

            portfolioBody.appendChild(row);

            if (portfolioCards) {
                const card = document.createElement('div');
                card.className = 'hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors';
                card.addEventListener('click', () => StockDetail.show(sym));

                const chipEventHTML = [chipLabel, eventAlert, supportMA !== 'X' ? '<span class="font-bold ' + supportMAColor + '">' + supportMA + '</span>' : ''].filter(Boolean).join(' · ');

                card.innerHTML = stockMobileCardHTML({
                    symbol: sym,
                    name: displayName,
                    badgeHTML: adviceBadge + (betaText ? '<span class="text-[10px] text-gray-500">' + betaText + '</span>' : '') + healthBadge,
                    primaryHTML: '<div class="' + priceClass + '">' +
                        '<div class="font-bold">' + (price > 0 ? formatNumber(price) : '--') + '</div>' +
                        '<div class="text-[10px]">' + (price > 0 ? (pct > 0 ? '▲' : (pct < 0 ? '▼' : '')) + Math.abs(pct).toFixed(2) + '%' : '--') + '</div>' +
                    '</div>',
                    metricsHTML: stockMetricHTML('股數/成本', formatNumber(shares, 0) + '股 @ ' + formatNumber(avgCost)) +
                        stockMetricHTML('損益', (pnl >= 0 ? '+' : '') + formatNumber(pnl, 0) + ' (' + roi.toFixed(2) + '%)', {
                            valueClass: (pnl >= 0 ? 'text-red-500' : 'text-green-500')
                        }),
                    detailHTML: chipEventHTML,
                    actionsHTML: '<button class="delete-stock-mobile inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-bold text-red-500 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40" title="刪除持股">刪除</button>'
                });

                card.querySelector('.delete-stock-mobile').addEventListener('click', (e) => {
                    e.stopPropagation();
                    deleteStockTrades(sym);
                });

                portfolioCards.appendChild(card);
            }
        });

        const curY = new Date().getFullYear().toString();

        const totalPnl = (isNaN(totalMV) || isNaN(totalCost)) ? 0 : (totalMV - totalCost);
        const totalPnlPercent = totalCost > 0 ? (totalPnl / totalCost * 100) : 0;
        const dPnl = isNaN(totalMV) || isNaN(totalRefMV) ? 0 : (totalMV - totalRefMV);

        totalMarketValueEl.textContent = formatNumber(totalMV, 0);
        totalPnlEl.textContent = (totalPnl >= 0 ? '+' : '') + formatNumber(totalPnl, 0);
        totalPnlEl.className = 'text-3xl font-mono font-bold ' + (totalPnl >= 0 ? 'text-red-500' : 'text-green-500');
        totalPnlPercentEl.textContent = totalPnlPercent.toFixed(2) + '%';
        totalPnlPercentEl.className = 'text-xs mt-1 ' + (totalPnl >= 0 ? 'text-red-500' : 'text-green-500');
        dailyPnlEl.textContent = (dPnl >= 0 ? '+' : '') + formatNumber(dPnl, 0);
        dailyPnlEl.className = 'text-3xl font-mono font-bold ' + (dPnl >= 0 ? 'text-red-500' : 'text-green-500');
        const pt = document.querySelector('#total-pnl')?.previousElementSibling;
        if (pt) pt.textContent = '總盈虧';
    }

    function renderAssetRow2(trades, holdings, quotes) {
        try {
            const curY = new Date().getFullYear().toString();
            const lastY = (curY - 1).toString();
            let totalMV = 0, totalCost = 0, totalDiv = 0;
            const cashflows = [{ date: new Date(), amount: 0 }];
            Object.keys(holdings).forEach(sym => {
                if (sym === 'yearlyStats' || !holdings[sym] || holdings[sym].shares <= 0.001) return;
                const h = holdings[sym];
                const q = quotes[sym] || quotes[sym.split('.')[0]] || {};
                const price = parseFloat(q.price || 0);
                const shares = parseFloat(h.shares || 0);
                const mv = price > 0 ? (price * shares) : (h.totalCost || 0);
                if (!isNaN(mv)) totalMV += mv;
                if (!isNaN(h.totalCost)) totalCost += h.totalCost;
                const actions = (CorporateActions && typeof CorporateActions.getActions === 'function') ? (CorporateActions.getActions(sym) || []) : [];
                const allDividendActions = actions.filter(a => a.ex_date && (a.type === 'DIVIDEND' || a.type === 'CASH_DIVIDEND') && a.cash_dividend > 0)
                    .sort((a, b) => (b.ex_date || '').localeCompare(a.ex_date || ''));

                // Select reference year: 2026 > 2025 > most recent available
                let refActions = allDividendActions.filter(a => {
                    const y = parseInt(a.ex_date.substring(0, 4));
                    return y === parseInt(curY) || y === parseInt(lastY);
                });
                if (refActions.length === 0 && allDividendActions.length > 0) {
                    const mostRecentYear = parseInt(allDividendActions[0].ex_date.substring(0, 4));
                    refActions = allDividendActions.filter(a => parseInt(a.ex_date.substring(0, 4)) === mostRecentYear);
                }

                const monthlyDividends = {};
                for (let m = 1; m <= 12; m++) monthlyDividends[m] = { cash: 0, year: null, exDate: null };
                refActions.filter(a => a.ex_date.startsWith(curY)).forEach(a => {
                    const month = parseInt(a.ex_date.split('-')[1]);
                    if (isNaN(month) || month < 1 || month > 12) return;
                    monthlyDividends[month] = { cash: a.cash_dividend, year: parseInt(curY), exDate: a.ex_date };
                });
                refActions.forEach(a => {
                    const month = parseInt(a.ex_date.split('-')[1]);
                    if (isNaN(month) || month < 1 || month > 12) return;
                    if (monthlyDividends[month].year === null) {
                        monthlyDividends[month] = { cash: a.cash_dividend, year: parseInt(a.ex_date.substring(0, 4)), exDate: a.ex_date };
                    }
                });
                Object.values(monthlyDividends).forEach(({ cash: dps, year, exDate }) => {
                    if (dps === 0 || !year) return;
                    const isHistorical = year !== parseInt(curY);
                    const sharesToUse = isHistorical ? shares : (typeof getSharesAtDate === 'function' && exDate ? getSharesAtDate(sym, exDate) : shares);
                    totalDiv += dps * sharesToUse;
                });
            });
            trades.forEach(t => {
                const sym = t.symbol || t.stock_id || t.stockId;
                if (!sym) return;
                const date = new Date(t.date || t.timestamp || t.tradeDate || t.trade_date);
                if (isNaN(date.getTime())) return;
                const side = String(t.side || t.type || '').toUpperCase();
                const qty = Math.abs(parseFloat(t.quantity || t.shares || 0));
                const price = parseFloat(t.price || 0);
                const fee = parseFloat(t.fee || 0);
                const tax = parseFloat(t.tax || 0);
                if (!qty || !price) return;
                if (side.includes('BUY') || side.includes('買')) {
                    cashflows.push({ date, amount: -(qty * price + fee) });
                } else if (side.includes('SELL') || side.includes('賣')) {
                    cashflows.push({ date, amount: qty * price - fee - tax });
                }
            });
            Object.keys(holdings).filter(s => s !== 'yearlyStats' && holdings[s].shares > 0.001).forEach(sym => {
                const h = holdings[sym];
                const q = quotes[sym] || quotes[sym.split('.')[0]] || {};
                const price = parseFloat(q.price || 0);
                const shares = parseFloat(h.shares || 0);
                const mv = price > 0 ? (price * shares) : (h.totalCost || 0);
                if (mv > 0) cashflows.push({ date: new Date(), amount: mv });
            });
            let irr = 0;
            if (cashflows.length >= 2 && typeof calculateXIRR === 'function') {
                irr = calculateXIRR(cashflows);
            }
            const totalReturn = totalCost > 0 ? ((totalMV - totalCost) / totalCost * 100) : 0;
            const retEl = document.getElementById('total-return-pct');
            if (retEl) { retEl.textContent = totalReturn.toFixed(2) + '%'; retEl.className = 'text-2xl md:text-3xl font-mono font-bold ' + (totalReturn >= 0 ? 'text-red-500' : 'text-green-500'); }
            const irrEl = document.getElementById('irr-value');
            if (irrEl) irrEl.textContent = irr !== 0 ? (irr * 100).toFixed(2) + '%' : '--';
            const divEl = document.getElementById('dividend-estimate');
            if (divEl) divEl.textContent = totalDiv > 0 ? '$' + formatNumber(totalDiv, 0) : '--';
        } catch(e) { console.error('renderAssetRow2 error:', e); }
    }

    async function renderExchangeRates() {
        try {
            const data = await api.fetchExchangeRates();
            const section = document.getElementById('exchange-rate-section');
            const grid = document.getElementById('exchange-rate-grid');
            const dateEl = document.getElementById('exchange-rate-date');
            if (!data || !data.rates || !data.rates.length) { if (section) section.classList.add('hidden'); return; }
            if (section) section.classList.remove('hidden');
            if (dateEl) dateEl.textContent = '更新: ' + data.date;
            if (grid) {
                const maxRate = Math.max(...data.rates.map(r => r.rate || 0));
                grid.innerHTML = data.rates.map(r => {
                    const rate = r.rate || 0;
                    const isHigh = rate >= (maxRate * 0.5);
                    return '<div class="bg-white dark:bg-[#161b22] p-3 md:p-4 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm transition-colors duration-300 flex items-center space-x-3">' +
                        '<span class="text-xl">' + r.flag + '</span>' +
                        '<div class="min-w-0 flex-1"><div class="text-[10px] text-gray-500 font-bold">' + r.code + '</div>' +
                        '<div class="text-sm font-mono font-bold ' + (isHigh ? 'text-red-500' : 'text-green-500') + '">' + (rate >= 1 ? rate.toFixed(2) : rate.toFixed(4)) + '</div></div></div>';
                }).join('');
            }
        } catch(e) { console.error('renderExchangeRates error:', e); }
    }

    async function renderMarketSummary(quotes) {
        try {
            const section = document.getElementById('market-summary-section');
            const content = document.getElementById('market-summary-content');
            if (!section || !content) return;
            const indexSymbols = ['IX0001', 'IX0043', '^DJI', '^IXIC', '^GSPC', '^SOX', 'TSM'];
            let allQuotes = {};
            try { allQuotes = await api.fetchQuotes(indexSymbols); } catch(e) {}
            if (Object.keys(allQuotes).length === 0) { section.classList.add('hidden'); return; }
            section.classList.remove('hidden');
            const formatIdx = (val) => { const n = parseFloat(val); return isNaN(n) || n === 0 ? '--' : n.toLocaleString(undefined, {minimumFractionDigits: 1, maximumFractionDigits: 1}); };
            const getPctColor = (pct) => parseFloat(pct || 0) >= 0 ? 'text-red-500' : 'text-green-500';
            const getItem = (sym) => {
                const clean = sym.replace('^', '').toUpperCase();
                return allQuotes[sym] || allQuotes['^' + clean] || allQuotes[clean] ||
                    (clean === 'IX0001' ? (allQuotes['TSE'] || allQuotes['^TWII'] || allQuotes['TWII']) : null) ||
                    (clean === 'IX0043' ? (allQuotes['OTC'] || allQuotes['^TWOII'] || allQuotes['TWOII']) : null) ||
                    { price: 0, changePercent: 0, source: 'N/A', date: '--' };
            };
            const getDateBadge = (item) => {
                if (item.source === 'REALTIME' || item.source === 'REALTIME_CHART') return '<span class="ml-1 animate-pulse text-blue-500">📡</span>';
                if (item.date && item.date !== '--') return '<span class="ml-1 text-[8px] bg-gray-100 dark:bg-gray-800 text-gray-400 px-1 rounded">' + item.date.substring(5) + '</span>';
                return '';
            };
            const formatPct = (val) => { const n = parseFloat(val); if (isNaN(n)) return '0.00'; return (n >= 0 ? '+' : '') + n.toFixed(2); };
            const tse = getItem('IX0001'), otc = getItem('IX0043'), dji = getItem('DJI'), sp = getItem('GSPC'), nas = getItem('IXIC'), sox = getItem('SOX'), tsm = getItem('TSM');
            const idxItem = (label, badge, price, pct) => {
                const c = parseFloat(pct || 0) >= 0 ? 'text-red-500' : 'text-green-500';
                const bg = label === '費半' ? 'bg-blue-500/5' : label === '台積ADR' ? 'bg-red-500/5' : '';
                return '<div class="' + bg + ' min-w-[80px] flex-1 px-2 py-1.5"><div class="text-[9px] md:text-[10px] text-gray-500 flex items-center whitespace-nowrap">' + label + ' ' + badge + '</div><div class="text-xs md:text-sm font-mono font-bold text-gray-900 dark:text-white truncate">' + price + '</div><div class="' + c + ' text-[9px] md:text-[10px] font-mono font-bold">' + formatPct(pct) + '%</div></div>';
            };
            content.innerHTML = '<div class="md:col-span-2 bg-white dark:bg-[#161b22] p-3 md:p-4 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm">' +
                '<div class="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">📊 市場概況</div>' +
                '<div class="flex flex-wrap">' +
                idxItem('加權', getDateBadge(tse), formatIdx(tse.price), tse.changePercent) +
                idxItem('櫃買', getDateBadge(otc), formatIdx(otc.price), otc.changePercent) +
                idxItem('道瓊', getDateBadge(dji), formatIdx(dji.price), dji.changePercent) +
                idxItem('標普', getDateBadge(sp), formatIdx(sp.price), sp.changePercent) +
                idxItem('納指', getDateBadge(nas), formatIdx(nas.price), nas.changePercent) +
                idxItem('費半', getDateBadge(sox), formatIdx(sox.price), sox.changePercent) +
                idxItem('台積ADR', getDateBadge(tsm), formatIdx(tsm.price), tsm.changePercent) +
                '</div></div>';
        } catch(e) { console.error('renderMarketSummary error:', e); }
    }

    async function loadAndRenderLiar() {
        try {
            const data = await api.fetchLocalJson('daily/liar.json').catch(() => null);
            const mainContainer = document.getElementById('liar-container');
            if (!data || !data.data || data.data.length === 0) {
                if (mainContainer) mainContainer.innerHTML = '<div class="text-center py-8 text-gray-500 text-sm">尚無外資喊話記錄</div>';
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
                const map = { 'LIE': { label: '說謊', color: 'bg-red-500', icon: '🐜' }, 'HONEST': { label: '誠實', color: 'bg-green-500', icon: '✅' }, 'PENDING': { label: '追蹤中', color: 'bg-orange-500', icon: '🕒' } };
                const s = map[status] || map['PENDING'];
                return '<span class="' + s.color + ' text-white text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center shadow-sm"><span class="mr-1">' + s.icon + '</span>' + s.label + '</span>';
            };
            const renderCard = (item) => {
                const name = stocksMeta[item.stockId] || stocksMeta[item.stockId.split('.')[0]] || '';
                const isUpgrade = item.sentiment === 'bullish';
                const sentimentColor = isUpgrade ? 'text-red-500' : 'text-green-500';
                return '<div class="liar-marquee-card p-4 bg-white dark:bg-[#161b22] rounded-2xl border border-gray-200 dark:border-gray-800 cursor-pointer hover:border-blue-500/50 transition-all shadow-sm group" onclick="window.StockDetail.show(\'' + item.stockId + '\')">' +
                    '<div class="flex justify-between items-start mb-3"><div><span class="text-[10px] ' + (isUpgrade ? 'bg-red-500' : 'bg-green-500') + ' text-white px-2 py-0.5 rounded font-bold uppercase tracking-wider">' + item.brokerName + '</span><div class="mt-1 text-xs font-mono font-bold text-gray-900 dark:text-white">' + item.stockId + ' <span class="text-gray-400 font-normal ml-1">' + name + '</span></div></div>' +
                    getStatusBadge(item.honestyStatus) + '</div>' +
                    '<div class="text-sm font-bold text-gray-800 dark:text-gray-200 line-clamp-2 mb-3 leading-snug h-10 group-hover:text-blue-500 transition-colors">' + item.newsTitle + '</div>' +
                    '<div class="flex justify-between items-center pt-3 border-t border-gray-100 dark:border-gray-800"><div class="text-center"><div class="text-[8px] text-gray-400 uppercase">目標價</div><div class="text-sm font-mono font-bold ' + sentimentColor + '">' + (item.targetPrice > 0 ? item.targetPrice : '--') + '</div></div>' +
                    '<div class="text-center"><div class="text-[8px] text-gray-400 uppercase">累積進出</div><div class="text-sm font-mono font-bold ' + (item.cumulativeVolume >= 0 ? 'text-red-500' : 'text-green-500') + '">' + (item.cumulativeVolume > 0 ? '+' : '') + Math.round(item.cumulativeVolume) + ' 張</div></div></div></div>';
            };
            if (mainContainer) {
                mainContainer.innerHTML = '<div class="liar-marquee-track">' + data.data.map(item => renderCard(item)).join('') + '</div>';
                initLiarMarquee(mainContainer, data.data.length);
            }
        } catch(e) { console.error('loadAndRenderLiar error:', e); }
    }

    function initLiarMarquee(container, totalItems) {
        if (totalItems <= 1) return;
        const track = container.querySelector('.liar-marquee-track');
        if (!track) return;
        const CARD_HEIGHT = 150;
        let currentIndex = 0;
        for (let i = 0; i < track.children.length; i++) {
            track.children[i].style.height = CARD_HEIGHT + 'px';
        }
        container.style.position = 'relative';
        container.style.overflow = 'hidden';
        container.style.height = CARD_HEIGHT + 'px';
        track.style.position = 'absolute';
        track.style.top = '0';
        track.style.left = '0';
        track.style.width = '100%';
        track.style.transition = 'transform 0.5s ease';
        const advance = () => {
            currentIndex = (currentIndex + 1) % totalItems;
            track.style.transform = 'translateY(-' + (currentIndex * CARD_HEIGHT) + 'px)';
        };
        let timer = setInterval(advance, 3000);
        container.addEventListener('mouseenter', function() { clearInterval(timer); });
        container.addEventListener('mouseleave', function() { timer = setInterval(advance, 3000); });
        let touchStartY = 0;
        container.addEventListener('touchstart', function(e) {
            clearInterval(timer);
            touchStartY = e.touches[0].clientY;
        }, { passive: true });
        container.addEventListener('touchend', function(e) {
            var diff = touchStartY - e.changedTouches[0].clientY;
            if (Math.abs(diff) > 30) {
                if (diff > 0 && currentIndex < totalItems - 1) { currentIndex++; }
                else if (diff < 0 && currentIndex > 0) { currentIndex--; }
                track.style.transform = 'translateY(-' + (currentIndex * CARD_HEIGHT) + 'px)';
            }
            setTimeout(function() { timer = setInterval(advance, 3500); }, 5000);
        }, { passive: true });
    }

    function renderBetaWarning(holdings) {
        try {
            const el = document.getElementById('beta-warning');
            const textEl = document.getElementById('beta-text');
            if (!el || !textEl) return;
            let totalWeightedBeta = 0, totalWeight = 0;
            Object.keys(holdings).forEach(sym => {
                if (sym === 'yearlyStats' || !holdings[sym] || holdings[sym].shares <= 0.001) return;
                const weight = holdings[sym].totalCost || 0;
                totalWeight += weight;
                totalWeightedBeta += (holdings[sym].beta || 1.0) * weight;
            });
            const beta = totalWeight > 0 ? totalWeightedBeta / totalWeight : 1.0;
            if (beta > 1.5) { el.classList.remove('hidden'); textEl.textContent = '投資組合平均 Beta: ' + beta.toFixed(2); }
            else { el.classList.add('hidden'); }
        } catch(e) { console.error('renderBetaWarning error:', e); }
    }

    function renderClosedHoldings(trades) {
        try {
            const section = document.getElementById('history-section');
            const body = document.getElementById('history-body');
            const count = document.getElementById('history-count');
            if (!section || !body || !count) return;
            const ytdRef = window._ytdRefCache || {};
            const holdings = CorporateActions.recalculateHoldings(trades, true, ytdRef.prices || {});
            const closed = Object.keys(holdings).filter(s => s !== 'yearlyStats' && holdings[s].shares <= 0.001);
            if (closed.length === 0) { section.classList.add('hidden'); return; }
            section.classList.remove('hidden');
            count.textContent = closed.length + ' 筆';
            body.innerHTML = closed.map(sym => {
                const h = holdings[sym];
                const totalPnl = (h.realizedPNL || 0) + (h.dividend || 0);
                return '<div class="p-4 flex justify-between items-center opacity-60 hover:opacity-100 transition-opacity">' +
                    '<div><div class="text-sm font-bold">' + sym + '</div><div class="text-[10px] text-gray-500">' + (h.name || '') + '</div></div>' +
                    '<div class="text-right"><div class="text-sm font-bold ' + (totalPnl >= 0 ? 'text-red-500' : 'text-green-500') + '">' + (totalPnl >= 0 ? '+' : '') + formatNumber(totalPnl, 0) + '</div></div></div>';
            }).join('');
            const toggle = document.getElementById('history-toggle');
            const chevron = document.getElementById('history-chevron');
            if (toggle && !toggle.dataset.listener) {
                toggle.dataset.listener = '1';
                toggle.addEventListener('click', () => {
                    const isOpen = !body.classList.contains('hidden');
                    body.classList.toggle('hidden');
                    if (chevron) chevron.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(90deg)';
                });
            }
        } catch(e) { console.error('renderClosedHoldings error:', e); }
    }

    async function renderMarketHealth() {
        try {
            const section = document.getElementById('market-health-section');
            const content = document.getElementById('market-health-content');
            if (!section || !content) return;

            const riskData = await api.fetchLocalJson('meta/market_risk.json').catch(() => null);
            if (!riskData) {
                section.classList.add('hidden');
                return;
            }

            const d = riskData.stocks?.[0] || riskData.data?.[0] || riskData;
            if (!d || !d.risk_score) {
                section.classList.add('hidden');
                return;
            }

            section.classList.remove('hidden');

            const riskScore = d.risk_score;
            const status = d.status || '--';
            const sentiment = d.retail_sentiment || '計算中';
            const marginRatio = d.margin_ratio || 1.0;
            const marginBalance = d.margin_balance || 0;
            const shortBalance = d.short_balance || 0;
            const shortMarginRatio = d.short_margin_ratio || 0;
            const summaryText = d.summary_text || '';

            const scoreColor = riskScore < 30 ? 'text-green-500' : riskScore < 50 ? 'text-blue-500' : riskScore < 70 ? 'text-orange-500' : 'text-red-500';
            const statusColor = riskScore < 30 ? 'bg-green-500' : riskScore < 50 ? 'bg-blue-500' : riskScore < 70 ? 'bg-orange-500' : 'bg-red-500';
            const sentimentColor = sentiment === '市場情緒過熱' ? 'text-red-500' : sentiment === '散戶偏積極' ? 'text-orange-500' : sentiment === '籌碼冷清' ? 'text-blue-500' : 'text-green-500';
            const sentimentBg = sentiment === '市場情緒過熱' ? 'bg-red-500/10' : sentiment === '散戶偏積極' ? 'bg-orange-500/10' : sentiment === '籌碼冷清' ? 'bg-blue-500/10' : 'bg-green-500/10';
            const marginBarColor = marginRatio > 1.1 ? 'bg-red-500' : marginRatio > 1.05 ? 'bg-orange-500' : marginRatio < 0.9 ? 'bg-blue-500' : 'bg-green-500';

            // 取得近一週融資歷史資料
            let marginHistory = [];
            try {
                const indexData = await api.fetchLocalJson('index.json').catch(() => ({}));
                const latestMarginDate = indexData.latest_daily_tw_market_margin || d.date;
                if (latestMarginDate) {
                    // 生成近 5 個交易日的日期
                    const dates = [];
                    const baseDate = new Date(latestMarginDate);
                    for (let i = 4; i >= 0; i--) {
                        const dt = new Date(baseDate);
                        dt.setDate(dt.getDate() - i);
                        dates.push(dt.toISOString().split('T')[0]);
                    }
                    // 取得各日資料
                    const promises = dates.map(date =>
                        api.fetchLocalJson(`daily/tw_market_margin/${date}.json`).catch(() => null)
                    );
                    const results = await Promise.all(promises);
                    marginHistory = results
                        .map((r, i) => {
                            if (!r) return null;
                            const stock = r.stocks?.[0] || r.data?.[0] || r;
                            return stock ? { date: dates[i], balance: (stock.total_margin_balance || 0) / 100000000 } : null;
                        })
                        .filter(Boolean);
                }
            } catch (e) {
                console.warn('Failed to load margin history:', e);
            }

            content.innerHTML = `
                <div class="flex flex-col md:flex-row gap-6">
                    <div class="w-full md:w-48 h-40" id="market-health-gauge"></div>
                    <div class="flex-1 space-y-3">
                        <div class="flex items-baseline space-x-2">
                            <span class="text-4xl font-black ${scoreColor}">${riskScore}</span>
                            <span class="text-xs text-gray-400">/ 100</span>
                            <span class="${statusColor} text-white text-[10px] px-2 py-0.5 rounded-full font-bold ml-2">${status}</span>
                        </div>
                        <div class="flex items-center space-x-2">
                            <span class="inline-block w-2 h-2 rounded-full ${sentimentColor.replace('text-', 'bg-')}"></span>
                            <span class="text-sm font-bold ${sentimentColor}">${sentiment}</span>
                            <span class="text-xs text-gray-500">券資指標</span>
                        </div>
                        <div class="grid grid-cols-3 gap-4 pt-2">
                            <div class="text-center">
                                <div class="text-[9px] text-gray-400 uppercase">融資餘額</div>
                                <div class="text-base font-mono font-bold">${(marginBalance / 100000000).toFixed(0)}<span class="text-[9px] text-gray-400"> 億</span></div>
                            </div>
                            <div class="text-center">
                                <div class="text-[9px] text-gray-400 uppercase">融券餘額</div>
                                <div class="text-base font-mono font-bold">${(shortBalance / 10000).toFixed(1)}<span class="text-[9px] text-gray-400"> 萬張</span></div>
                            </div>
                            <div class="text-center">
                                <div class="text-[9px] text-gray-400 uppercase">券資比</div>
                                <div class="text-base font-mono font-bold">${shortMarginRatio.toFixed(1)}<span class="text-[9px] text-gray-400">%</span></div>
                            </div>
                        </div>
                        <!-- 近一週融資餘額曲線 -->
                        <div class="pt-2">
                            <div class="text-[10px] text-gray-400 font-semibold mb-1">近一週融資餘額</div>
                            <div id="margin-history-chart" class="w-full h-20"></div>
                            ${marginHistory.length > 0 ? `
                            <div class="text-[9px] text-gray-500 mt-1">最新：<span class="font-bold text-orange-500">${marginHistory[marginHistory.length - 1]?.balance?.toFixed(0) || '--'}</span> 億</div>
                            ` : ''}
                        </div>
                    </div>
                </div>
                <div class="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 space-y-2">
                    <div class="flex justify-between items-center">
                        <span class="text-[10px] text-gray-500">融資水位 (vs MA20)</span>
                        <span class="text-[10px] font-bold font-mono">${(marginRatio * 100).toFixed(1)}%</span>
                    </div>
                    <div class="w-full h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                        <div class="h-full rounded-full ${marginBarColor}" style="width: ${Math.min(100, marginRatio / 1.5 * 100)}%"></div>
                    </div>
                    <div class="text-[8px] text-gray-400 leading-relaxed">融資水位 = 目前融資餘額 / MA20 月均線。>100% 表示融資增加（散戶偏多），<100% 表示融資減少（散戶偏空）。</div>
                    ${d.maintenance_rate ? `
                    <div class="flex justify-between items-center pt-1">
                        <span class="text-[10px] text-gray-500">普通股融資市值比</span>
                        <span class="text-[10px] font-bold font-mono ${d.maintenance_rate < 140 ? "text-red-500" : d.maintenance_rate < 150 ? "text-orange-500" : "text-green-500"}">${d.maintenance_rate.toFixed(1)}%${d.maintenance_rate < 140 ? " ⚠️" : ""}</span>
                    </div>
                    <div class="text-[8px] text-gray-400 leading-relaxed">普通股融資市值比 = Σ(普通股融資張數×收盤×1000) / 全市場融資金額。</div>` : ""}
                    <div class="text-[10px] text-gray-500 leading-relaxed mt-1">${summaryText}</div>
                    <div class="mt-6 pt-4 border-t border-gray-100 dark:border-gray-800">
                        <div class="flex justify-between items-center mb-2">
                            <span class="text-xs font-bold text-gray-400 uppercase tracking-widest">普通股融資市值比歷史走勢</span>
                            <span class="text-[9px] text-gray-500">雙軸：市值比 / 加權指數</span>
                        </div>
                        <div id="maintenance-rate-trend-chart" class="w-full" style="height:260px;"></div>
                    </div>
                </div>
            `;

            // 繪製融資歷史曲線
            if (marginHistory.length > 0 && typeof echarts !== 'undefined') {
                const chartContainer = document.getElementById('margin-history-chart');
                if (chartContainer) {
                    const chart = echarts.init(chartContainer);
                    const balances = marginHistory.map(h => h.balance);
                    const minBal = Math.min(...balances);
                    const maxBal = Math.max(...balances);
                    const margin = (maxBal - minBal) * 0.05;
                    chart.setOption({
                        backgroundColor: 'transparent',
                        grid: { top: 5, bottom: 20, left: 40, right: 10 },
                        tooltip: { trigger: 'axis', formatter: '{b}<br/>融資餘額：{c} 億' },
                        xAxis: {
                            type: 'category',
                            data: marginHistory.map(h => h.date.slice(5)),
                            axisLabel: { fontSize: 8 },
                            axisLine: { lineStyle: { color: '#374151' } }
                        },
                        yAxis: {
                            type: 'value',
                            min: minBal - margin,
                            max: maxBal + margin,
                            axisLabel: { fontSize: 8, formatter: '{value}' },
                            splitLine: { lineStyle: { color: '#374151', type: 'dashed' } }
                        },
                        series: [{
                            type: 'line',
                            data: balances,
                            smooth: true,
                            symbol: 'circle',
                            symbolSize: 6,
                            lineStyle: { color: '#f97316', width: 2 },
                            itemStyle: { color: '#f97316' },
                            areaStyle: {
                                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                                    { offset: 0, color: 'rgba(249, 115, 22, 0.3)' },
                                    { offset: 1, color: 'rgba(249, 115, 22, 0.05)' }
                                ])
                            }
                        }]
                    });
                    window.addEventListener('resize', () => chart.resize());
                }
            }

            const mrChartContainer = document.getElementById('maintenance-rate-trend-chart');
            if (mrChartContainer && typeof echarts !== 'undefined') {
                api.fetchLocalJson('meta/market_margin_history.json').then(histData => {
                    if (!histData || !histData.history || histData.history.length < 5) return;
                    const valid = histData.history.filter(h => h.index_close > 0 && h.maintenance_rate > 0 && h.margin_shares_count >= 1000);
                    if (valid.length < 5) return;
                    const dates = valid.map(h => h.date.substring(5));
                    const rates = valid.map(h => h.maintenance_rate);
                    const indices = valid.map(h => h.index_close);
                    const chart2 = echarts.init(mrChartContainer);
                    chart2.setOption({
                        tooltip: {
                            trigger: 'axis',
                            axisPointer: { type: 'cross' },
                            backgroundColor: 'rgba(22,27,34,0.9)',
                            borderColor: '#30363d',
                            textStyle: { color: '#e6edf3', fontSize: 10 },
                            formatter: function(params) {
                                const p = params[0];
                                const date = valid[p.dataIndex]?.date || '';
                                return date +
                                    '<br/>市值比: <span style=\"color:#3b82f6\">' +
                                    p.value.toFixed(2) + '%</span>' +
                                    '<br/>加權: <span style=\"color:#f59e0b\">' +
                                    params[1].value.toLocaleString() + '</span>';
                            }
                        },
                        legend: {
                            data: ['普通股市值比', '加權指數'],
                            top: 0,
                            textStyle: { color: '#8b949e', fontSize: 10 }
                        },
                        grid: {
                            left: '3%', right: '4%',
                            bottom: '3%', top: '18%',
                            containLabel: true
                        },
                        xAxis: {
                            type: 'category',
                            data: dates,
                            axisLine: { lineStyle: { color: '#30363d' } },
                            axisLabel: {
                                color: '#8b949e', fontSize: 8,
                                interval: Math.max(0, Math.floor(dates.length / 15) - 1)
                            },
                            splitLine: { show: false }
                        },
                        yAxis: [
                            {
                                type: 'value',
                                name: '市值比 %',
                                nameTextStyle: { color: '#3b82f6', fontSize: 9 },
                                min: 130, max: 220,
                                axisLine: { lineStyle: { color: '#3b82f6' } },
                                axisLabel: { color: '#3b82f6', fontSize: 9, formatter: '{value}%' },
                                splitLine: { lineStyle: { color: '#21262d', type: 'dashed' } }
                            },
                            {
                                type: 'value',
                                name: '加權指數',
                                nameTextStyle: { color: '#f59e0b', fontSize: 9 },
                                axisLine: { lineStyle: { color: '#f59e0b' } },
                                axisLabel: {
                                    color: '#f59e0b', fontSize: 9,
                                    formatter: function(v) { return (v/1000).toFixed(0) + 'k'; }
                                },
                                splitLine: { show: false }
                            }
                        ],
                        series: [
                            {
                                name: '普通股市值比',
                                type: 'line',
                                data: rates,
                                smooth: true,
                                symbol: 'none',
                                lineStyle: { width: 2, color: '#3b82f6' },
                                areaStyle: {
                                    color: {
                                        type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
                                        colorStops: [
                                            { offset: 0, color: 'rgba(59,130,246,0.3)' },
                                            { offset: 1, color: 'rgba(59,130,246,0.02)' }
                                        ]
                                    }
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
                                        type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
                                        colorStops: [
                                            { offset: 0, color: 'rgba(245,158,11,0.2)' },
                                            { offset: 1, color: 'rgba(245,158,11,0.02)' }
                                        ]
                                    }
                                }
                            }
                        ],
                        backgroundColor: 'transparent'
                    });
                    window.addEventListener('resize', () => chart2.resize());
                }).catch(() => {});
            }

            const gaugeContainer = document.getElementById('market-health-gauge');
            if (gaugeContainer && typeof echarts !== 'undefined') {
                const chart = echarts.init(gaugeContainer);
                chart.setOption({
                    series: [{
                        type: 'gauge',
                        startAngle: 210,
                        endAngle: -30,
                        min: 0,
                        max: 100,
                        splitNumber: 5,
                        radius: '90%',
                        center: ['50%', '55%'],
                        axisLine: {
                            lineStyle: {
                                width: 8,
                                color: [
                                    [0.3, '#22c55e'],
                                    [0.5, '#3b82f6'],
                                    [0.7, '#f97316'],
                                    [1.0, '#ef4444']
                                ]
                            }
                        },
                        axisTick: { show: false },
                        splitLine: { show: false },
                        axisLabel: { show: false },
                        pointer: {
                            length: '55%',
                            width: 3,
                            itemStyle: { color: 'auto' }
                        },
                        title: { show: false },
                        detail: { show: false },
                        data: [{ value: riskScore, name: '' }]
                    }]
                });
                window.addEventListener('resize', () => chart.resize());
            }
        } catch(e) { console.error('renderMarketHealth error:', e); }
    }

    async function renderMarketDivergence() {
        try {
            const section = document.getElementById('market-divergence-section');
            const content = document.getElementById('market-divergence-content');
            if (!section || !content) return;

            const data = await api.fetchLocalJson('meta/market_divergence_alert.json').catch(() => null);
            if (!data) {
                section.classList.add('hidden');
                return;
            }

            const d = data.stocks?.[0] || data.data?.[0] || data;
            if (!d || d.bias5 === undefined) {
                section.classList.add('hidden');
                return;
            }

            section.classList.remove('hidden');

            const isAlert = d.is_alert;
            const severity = d.severity || 'normal';
            const bias5 = d.bias5 || 0;
            const volRatio = d.vol_ratio || 0;
            const triggerBias = d.trigger_bias_threshold || 0;
            const triggerVol = d.trigger_vol_threshold || 1.2;
            const crashProb = d.crash_probability || 0;
            const summary = d.summary || '';

            const severityConfig = {
                danger: { icon: '🔴', label: '危險', bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-500', bar: 'bg-red-500' },
                warning: { icon: '🟡', label: '注意', bg: 'bg-orange-500/10', border: 'border-orange-500/30', text: 'text-orange-500', bar: 'bg-orange-500' },
                normal: { icon: '🟢', label: '正常', bg: 'bg-green-500/10', border: 'border-green-500/30', text: 'text-green-500', bar: 'bg-green-500' }
            };
            const cfg = severityConfig[severity] || severityConfig.normal;

            const biasPct = Math.abs(triggerBias) > 0 ? Math.min(100, (Math.abs(bias5) / Math.abs(triggerBias)) * 100) : 0;
            const volPct = triggerVol > 0 ? Math.min(100, (volRatio / triggerVol) * 100) : 0;

            content.innerHTML = `
                <div class="flex items-start space-x-4">
                    <div class="text-4xl ${cfg.text}">${cfg.icon}</div>
                    <div class="flex-1 space-y-3">
                        <div class="flex items-baseline space-x-2">
                            <span class="text-lg font-black ${cfg.text}">${cfg.label}</span>
                            ${isAlert ? '<span class="text-[10px] px-2 py-0.5 rounded-full font-bold ' + cfg.text + ' ' + cfg.bg + '">觸發警示</span>' : '<span class="text-[10px] text-gray-500">未觸發</span>'}
                        </div>
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <div class="flex justify-between text-[10px] text-gray-500 mb-1">
                                    <span>乖離率 (BIAS5)</span>
                                    <span class="font-bold font-mono ${isAlert ? cfg.text : ''}">${bias5.toFixed(2)}% / 門檻 ${Math.abs(triggerBias).toFixed(2)}%</span>
                                </div>
                                <div class="w-full h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                                    <div class="h-full rounded-full ${cfg.bar}" style="width: ${biasPct}%"></div>
                                </div>
                            </div>
                            ${volRatio > 0 ? `
                            <div>
                                <div class="flex justify-between text-[10px] text-gray-500 mb-1">
                                    <span>成交量能比</span>
                                    <span class="font-bold font-mono">${volRatio.toFixed(2)}x / ${triggerVol.toFixed(1)}x</span>
                                </div>
                                <div class="w-full h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                                    <div class="h-full rounded-full ${cfg.bar}" style="width: ${volPct}%"></div>
                                </div>
                            </div>
                            ` : `
                            <div class="text-[10px] text-gray-400">成交量能比：暫無數據</div>
                            `}
                        </div>
                        ${crashProb > 0 ? `
                        <div class="flex items-center space-x-2 pt-1">
                            <span class="text-[10px] text-gray-500">歷史修正機率</span>
                            <div class="flex-1 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden max-w-[100px]">
                                <div class="h-full rounded-full ${cfg.bar}" style="width: ${Math.min(100, crashProb * 100)}%"></div>
                            </div>
                            <span class="text-[10px] font-bold font-mono ${cfg.text}">${(crashProb * 100).toFixed(0)}%</span>
                        </div>
                        ` : ''}
                        <div class="text-[10px] text-gray-500 leading-relaxed pt-1 border-t border-gray-100 dark:border-gray-800">${summary}</div>
                    </div>
                </div>
            `;
        } catch(e) { console.error('renderMarketDivergence error:', e); }
    }

    function setupSortHandlers() {
        document.querySelectorAll('th[data-sort]').forEach(th => {
            th.addEventListener('click', () => {
                const key = th.dataset.sort;
                if (currentSort.key === key) currentSort.asc = !currentSort.asc;
                else { currentSort.key = key; currentSort.asc = true; }
                document.querySelectorAll('th[data-sort] .sort-icon').forEach(icon => icon.textContent = '');
                const icon = th.querySelector('.sort-icon');
                if (icon) icon.textContent = currentSort.asc ? ' ▲' : ' ▼';
                renderPortfolio(lastTrades, currentQuotes);
            });
        });
    }

    async function exportTrades() {
        const trades = await db.getAllTrades();
        const blob = new Blob([JSON.stringify({ transactions: trades, exportedAt: new Date().toISOString() })], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${new Date().toISOString().slice(0, 10)}_交易.json`;
        a.click();
        URL.revokeObjectURL(url);
    }
    window.exportTrades = exportTrades;

    async function deleteStockTrades(symbol) {
        if (!confirm('確定要刪除 ' + symbol + ' 的紀錄嗎？')) return;
        const trades = await db.getAllTrades();
        const filtered = trades.filter(t => (t.symbol || t.stock_id || t.stockId) !== symbol);
        await db.clearAllTrades();
        if (filtered.length > 0) await db.saveTrades(filtered);
        init();
    }

    function formatNumber(num, decimals = 2) {
        const n = parseFloat(num);
        if (isNaN(n)) return '--';
        return new Intl.NumberFormat('zh-TW', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n);
    }
    function getPriceColor(p, r, sym) {
        const style = getPriceChangeStyle(p, r, sym);
        return style.bgClass ? style.textClass + ' ' + style.bgClass : style.textClass;
    }
    window.addEventListener('twstock:ready', () => init());
    window.api = api; window.db = db; window.CorporateActions = CorporateActions; window.StockDetail = StockDetail;
    setupSortHandlers();
    // Note: init() is triggered by twstock:ready event from auth.js, not called directly here
    // to prevent double initialization (both direct call + twstock:ready would cause duplicate rendering)
});
