/**
 * Stock Detail Workstation Module
 * Handles the 12-tab analysis view for a specific stock
 */
import { api } from '../api.js';
import { charts } from '../charts.js';
import { db } from '../db.js';
import { CorporateActions } from '../corporateActions.js';
import { getPriceChangeStyle } from '../utils/priceStyle.js';
import { canonicalGroupName, cleanGroupName } from '../utils/groupTaxonomy.js';

export const StockDetail = {
    currentSymbol: null,
    currentTab: 'K線',
    tabs: ['走勢', 'K線', '健檢', '盤面', '新聞', '基本', '營收', '獲利', '股利', '大股東', '明細'],

    async show(symbol) {
        this.currentSymbol = symbol;
        const overlay = document.getElementById('stock-detail');
        if (!overlay) return;

        overlay.classList.remove('hidden');
        
        let liarData = null;
        try { liarData = await api.fetchLiarData(); } catch(e) { console.warn("fetchLiarData failed:", e); }
        this.renderLiarWarning(liarData);

        this.renderTabs();
        this.switchTab(this.currentTab);
        
        const detailSymbolEl = document.getElementById('detail-symbol');
        if (detailSymbolEl) detailSymbolEl.textContent = symbol;
        this.updateHeader(symbol);

        this.updateFavoriteUI();
        
        const toggleBtn = document.getElementById('toggle-favorite-btn');
        if (toggleBtn) {
            const newBtn = toggleBtn.cloneNode(true);
            toggleBtn.parentNode.replaceChild(newBtn, toggleBtn);
            newBtn.addEventListener('click', () => {
                if (window.Favorites) {
                    window.Favorites.toggleFavorite(this.currentSymbol);
                    this.updateFavoriteUI();
                }
            });
        }
    },

    async updateHeader(symbol) {
        const nameEl = document.getElementById('detail-name');
        const priceEl = document.getElementById('detail-price');
        const changeEl = document.getElementById('detail-change');
        if (nameEl) nameEl.textContent = '--';
        if (priceEl) {
            priceEl.textContent = '--';
            priceEl.className = 'text-xl font-mono font-bold text-gray-900 dark:text-white';
        }
        if (changeEl) {
            changeEl.textContent = '--';
            changeEl.className = 'text-xs text-gray-500';
        }

        try {
            const [stockInfo, quoteMap] = await Promise.all([
                api.getStockInfo(symbol).catch(() => null),
                api.fetchQuotes([symbol]).catch(() => ({}))
            ]);
            const q = quoteMap[symbol] || quoteMap[symbol.split('.')[0]] || {};
            if (nameEl) nameEl.textContent = stockInfo?.name || q.name || '--';

            const price = parseFloat(q.price || 0);
            const refPrice = parseFloat(q.referencePrice || price || 0);
            const changePercent = q.changePercent != null ? parseFloat(q.changePercent) : (price > 0 && refPrice > 0 ? ((price - refPrice) / refPrice * 100) : null);
            const style = getPriceChangeStyle(price, refPrice, symbol);
            const priceClass = style.bgClass ? `${style.textClass} ${style.bgClass} rounded px-2 py-0.5` : style.textClass;

            if (priceEl) {
                priceEl.textContent = price > 0 ? this.formatValue(price) : '--';
                priceEl.className = `text-xl font-mono font-bold ${price > 0 ? priceClass : 'text-gray-900 dark:text-white'}`;
            }
            if (changeEl) {
                const arrow = changePercent > 0 ? '▲' : (changePercent < 0 ? '▼' : '');
                changeEl.textContent = changePercent != null && Number.isFinite(changePercent) ? `${arrow} ${Math.abs(changePercent).toFixed(2)}%` : '--';
                changeEl.className = `text-xs ${price > 0 ? priceClass : 'text-gray-500'}`;
            }
        } catch (e) {
            console.warn('StockDetail header update failed:', e);
        }
    },

    updateFavoriteUI() {
        const toggleBtn = document.getElementById('toggle-favorite-btn');
        if (!toggleBtn || !window.Favorites) return;
        if (window.Favorites.isFavorite(this.currentSymbol)) {
            toggleBtn.classList.add('text-red-500'); toggleBtn.classList.remove('text-gray-300');
        } else {
            toggleBtn.classList.remove('text-red-500'); toggleBtn.classList.add('text-gray-300');
        }
    },

    cleanClassificationValue(value) {
        return cleanGroupName(value);
    },

    canonicalClassificationValue(value) {
        return canonicalGroupName(value);
    },

    buildClassification(stockInfo) {
        const macroSector = this.canonicalClassificationValue(stockInfo?.macro_sector);
        const primaryTheme = this.canonicalClassificationValue(stockInfo?.primary_theme || stockInfo?.sub_industry);
        const officialSector = this.canonicalClassificationValue(stockInfo?.official_sector || stockInfo?.industry);
        const subIndustry = this.canonicalClassificationValue(stockInfo?.sub_industry);
        const powerChainRole = this.canonicalClassificationValue(stockInfo?.power_chain_role);
        const seen = new Set([macroSector, primaryTheme, officialSector].filter(Boolean));
        const themes = (stockInfo?.themes || [])
            .map(t => this.canonicalClassificationValue(t))
            .filter(Boolean)
            .filter(t => {
                if (seen.has(t)) return false;
                seen.add(t);
                return true;
            });
        return { macroSector, primaryTheme, officialSector, subIndustry, powerChainRole, themes };
    },

    renderClassificationPanel(stockInfo) {
        const c = this.buildClassification(stockInfo);
        const chip = (label, value, cls) => value ? `
            <button type="button"
                onclick="event.stopPropagation(); window.GroupSearch?.openGroup(decodeURIComponent('${encodeURIComponent(value)}'))"
                title="查看 ${this.escapeHtml(value)} 個股列表"
                class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg ${cls} hover:ring-2 hover:ring-current/20 active:scale-[0.98] transition">
                <span class="text-[10px] opacity-75">${label}</span>
                <span class="text-xs font-bold">${this.escapeHtml(value)}</span>
            </button>` : '';
        const themeChips = c.themes.slice(0, 5).map(t => chip('題材', t, 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300')).join('');
        const chips = [
            chip('大板塊', c.macroSector, 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300'),
            c.primaryTheme ? '<span class="text-gray-400 text-xs font-bold">›</span>' : '',
            chip('主分類', c.primaryTheme, 'bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300'),
            c.officialSector !== c.primaryTheme ? chip('官方', c.officialSector, 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300') : '',
            c.subIndustry && c.subIndustry !== c.primaryTheme ? chip('細分', c.subIndustry, 'bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300') : '',
            chip('角色', c.powerChainRole, 'bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300'),
            themeChips
        ].filter(Boolean).join('');

        if (!chips) return '';
        return `
            <div class="mt-4">
                <div class="text-xs text-gray-500 mb-1.5">分類路徑</div>
                <div class="flex flex-wrap items-center gap-1.5">${chips}</div>
            </div>`;
    },

    renderLiarWarning(data) {
        let warningContainer = document.getElementById('liar-warning-container');
        if (!warningContainer) {
            warningContainer = document.createElement('div');
            warningContainer.id = 'liar-warning-container';
            const header = document.querySelector('#stock-detail header');
            if (header) header.after(warningContainer);
        }

        const liar = data?.data?.find(item => item.stockId === this.currentSymbol);
        if (liar) {
            const isLie = liar.honestyStatus === 'LIE';
            const isHonest = liar.honestyStatus === 'HONEST';
            const isUpgrade = liar.sentiment === 'bullish';
            
            const statusMap = {
                'LIE': { label: '說謊警告', color: 'bg-red-500', icon: '🚨' },
                'HONEST': { label: '誠實認證', color: 'bg-green-500', icon: '✅' },
                'PENDING': { label: '追蹤中', color: 'bg-orange-500', icon: '🕒' }
            };
            const s = statusMap[liar.honestyStatus] || statusMap['PENDING'];

            warningContainer.innerHTML = `
                <div class="m-4 p-4 ${isLie ? 'bg-red-500/10 border-red-500/20' : (isHonest ? 'bg-green-500/10 border-green-500/20' : 'bg-orange-500/10 border-orange-500/20')} border rounded-xl flex items-center shadow-sm transition-all">
                    <div class="w-10 h-10 ${s.color} rounded-full flex items-center justify-center mr-4 flex-none shadow-md">
                        <span class="text-white text-lg font-bold">${s.icon}</span>
                    </div>
                    <div class="flex-1">
                        <div class="flex justify-between items-center mb-1">
                            <h4 class="${isLie ? 'text-red-500' : (isHonest ? 'text-green-500' : 'text-orange-500')} font-bold text-sm">${s.label}：外資分析師操作監控</h4>
                            ${isLie ? `<span class="bg-orange-500 text-white text-[10px] px-2 py-0.5 rounded font-bold">說謊指數: ${liar.lyingScore}</span>` : ''}
                        </div>
                        <p class="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">
                            <span class="font-bold">${liar.brokerName}</span> 於 ${liar.date} ${isUpgrade ? '看多' : '看空'}本股
                            ${liar.targetPrice > 0 ? `至 <span class="font-bold ${isUpgrade ? 'text-red-500' : 'text-green-500'}">${liar.targetPrice}</span> 元` : ''}，
                            追蹤 ${liar.daysTracked} 天以來，分點累積進出 <span class="font-bold ${liar.cumulativeVolume >= 0 ? 'text-red-500' : 'text-green-500'}">${Math.round(liar.cumulativeVolume)}</span> 張。
                            ${isLie ? '<br/><span class="text-[10px] text-red-400 font-bold">⚠️ 警告：目前操作方向與喊話完全相反！</span>' : ''}
                        </p>
                    </div>
                </div>
            `;
        } else { warningContainer.innerHTML = ''; }
    },

    renderTabs() {
        let tabContainer = document.getElementById('detail-tabs');
        if (!tabContainer) {
            tabContainer = document.createElement('div');
            tabContainer.id = 'detail-tabs';
            tabContainer.className = 'flex overflow-x-auto border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-[#0f1115] no-scrollbar min-h-[44px]';
            document.querySelector('#stock-detail header').after(tabContainer);
        }

        tabContainer.innerHTML = this.tabs.map(tab => `
            <button class="flex-none px-6 py-3 text-sm font-medium transition-colors ${this.currentTab === tab ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}"
                    onclick="window.StockDetail.switchTab('${tab}')">${tab}</button>
        `).join('');
    },

    async switchTab(tab) {
        this.currentTab = tab;
        this.renderTabs();
        const contentContainer = document.querySelector('#stock-detail .flex-1');
        contentContainer.innerHTML = '<div class="flex items-center justify-center h-full"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>';

        try {
            switch (tab) {
                case '走勢':
                case 'K線': await this.renderKLineTab(contentContainer); break;
                case '健檢': await this.renderHealthTab(contentContainer); break;
                case '盤面': await this.renderMarketTab(contentContainer); break;
                case '新聞': await this.renderNewsTab(contentContainer); break;
                case '基本': await this.renderFundamentalTab(contentContainer); break;
                case '營收': await this.renderRevenueTab(contentContainer); break;
                case '獲利': await this.renderProfitTab(contentContainer); break;
                case '股利': await this.renderDividendTab(contentContainer); break;
                case '大股東': await this.renderShareholderTab(contentContainer); break;
                case '明細': await this.renderTradesTab(contentContainer); break;
                default: contentContainer.innerHTML = `<div class="flex items-center justify-center h-full text-gray-500">${tab} 模組開發中...</div>`;
            }
        } catch (err) { contentContainer.innerHTML = `<div class="flex items-center justify-center h-full text-red-500">載入失敗: ${err.message}</div>`; }
    },

    async renderKLineTab(container) {
        container.innerHTML = `<div class="flex-1 flex flex-col h-full overflow-hidden">
            <div id="detail-chart-container" class="w-full h-[320px] md:h-[400px]"></div>
            <div class="flex-1 border-t border-gray-100 dark:border-gray-800 mt-2 p-4 overflow-y-auto no-scrollbar">
                <h4 class="text-xs font-bold text-gray-400 mb-3 uppercase tracking-wider">最近交易紀錄</h4>
                <div id="detail-quick-trades" class="space-y-2"><div class="text-center py-4 text-gray-500 text-xs">載入中...</div></div>
            </div>
        </div>`;
        
        charts.init('detail-chart-container');
        const [chartData, structureData, trades, healthData] = await Promise.all([
            api.fetchChart(this.currentSymbol).catch(() => null),
            api.fetchStructure(this.currentSymbol).catch(() => null),
            db.getAllTrades().catch(() => []),
            api.fetchHealthData(this.currentSymbol).catch(() => null)
        ]);
        
        if (chartData) charts.renderKLine(this.currentSymbol, chartData, trades, structureData, healthData);
        else document.getElementById('detail-chart-container').innerHTML = `<div class="flex items-center justify-center h-full text-gray-500 text-sm font-bold">暫無 K 線歷史數據</div>`;

        const quickTradesContainer = document.getElementById('detail-quick-trades');
        if (quickTradesContainer) {
            const relevant = trades.filter(t => (t.symbol || t.stock_id || t.stockId || '').split('.')[0] === this.currentSymbol.split('.')[0])
                                 .sort((a, b) => new Date(b.date || b.timestamp) - new Date(a.date || a.timestamp));
            quickTradesContainer.innerHTML = relevant.map(t => {
                const isBuy = (t.side || t.type || '').toLowerCase().includes('buy') || (t.side || t.type || '').includes('買');
                return `<div class="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-100 dark:border-gray-800">
                    <div class="flex items-center space-x-3">
                        <span class="text-[10px] px-1.5 py-0.5 rounded font-bold ${isBuy ? 'bg-red-500/10 text-red-500' : 'bg-green-500/10 text-green-500'}">${isBuy ? '買' : '賣'}</span>
                        <span class="text-xs font-mono text-gray-500">${this.parseDate(t.date || t.timestamp)}</span>
                    </div>
                    <div class="text-right">
                        <div class="text-xs font-bold dark:text-white">${this.formatValue(t.shares || t.quantity, 0)} 股</div>
                        <div class="text-[10px] text-gray-400">$${this.formatValue(t.price)}</div>
                    </div>
                </div>`;
            }).join('') || '<div class="text-center py-4 text-gray-500 text-xs">尚無交易紀錄</div>';
        }
    },

    renderFairValueDetail(fairValue, stockInfo = null) {
        const titleName = stockInfo?.name || fairValue?.name || this.currentSymbol;
        const labels = {
            residual_income: 'Residual Income（剩餘收益）',
            dividend_discount: 'Dividend Discount（股利折現）',
            relative_pb: 'Relative P/B（同業股價淨值比）',
            relative_pe: 'Relative P/E（同業本益比）'
        };
        if (!fairValue || fairValue.status !== 'ok' || fairValue.fair_value == null) {
            const missing = fairValue?.missing_data?.length ? `資料不足：${fairValue.missing_data.join('、')}` : '資料不足，尚未產生公允價';
            return `<div class="bg-gray-50 dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5" data-testid="fair-value-detail"><h3 class="text-sm font-bold">自有公允值（${this.escapeHtml(this.currentSymbol)} ${this.escapeHtml(titleName)}）</h3><p class="text-xs text-gray-500 mt-2">${this.escapeHtml(missing)}</p></div>`;
        }
        const input = fairValue.inputs || {};
        const inputRows = [
            ['TTM EPS', input.ttm_eps, 2], ['BVPS', input.bvps, 2], ['ROE', input.roe != null ? `${(input.roe * 100).toFixed(1)}%` : '--'],
            ['Beta', input.beta, 2], ['股權成本 Ke', input.cost_of_equity != null ? `${(input.cost_of_equity * 100).toFixed(2)}%` : '--'],
            ['終值成長 g', input.terminal_growth != null ? `${(input.terminal_growth * 100).toFixed(2)}%` : '--']
        ];
        const formatInput = (value, decimals = 1) => typeof value === 'number' ? value.toFixed(decimals) : (value || '--');
        const upside = Number(fairValue.upside);
        const upsideClass = Number.isFinite(upside) && upside >= 0 ? 'text-red-500' : 'text-green-500';
        return `
            <div class="bg-orange-50 dark:bg-orange-950/20 rounded-2xl border border-orange-200 dark:border-orange-800/40 p-5" data-testid="fair-value-detail">
                <div class="flex items-center justify-between gap-3 mb-4">
                    <div><h3 class="text-sm font-bold text-orange-700 dark:text-orange-300">公允值明細（${this.escapeHtml(this.currentSymbol)} ${this.escapeHtml(titleName)}）</h3><p class="text-[10px] text-gray-500 mt-1">模型：${this.escapeHtml(labels[fairValue.model] || fairValue.model || '公開資料估值')}</p></div>
                    <span class="text-[10px] px-2 py-1 rounded-full bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300">${this.escapeHtml(fairValue.confidence || '--')}</span>
                </div>
                <div class="grid grid-cols-2 md:grid-cols-6 gap-3">
                    ${[['基準公允值', fairValue.fair_value, 'text-orange-600'], ['現價', fairValue.market_price, 'text-gray-900 dark:text-white'], ['上行空間', Number.isFinite(upside) ? `${(upside * 100).toFixed(1)}%` : '--', upsideClass], ['悲觀', fairValue.range?.bear, 'text-gray-700 dark:text-gray-300'], ['基準', fairValue.range?.base, 'text-gray-700 dark:text-gray-300'], ['樂觀', fairValue.range?.bull, 'text-gray-700 dark:text-gray-300']].map(([label, value, cls]) => `<div class="bg-white/70 dark:bg-gray-900/50 rounded-xl p-3 border border-orange-100 dark:border-orange-900/30"><div class="text-[10px] text-gray-500 mb-1">${label}</div><div class="text-lg font-bold font-mono ${cls}">${typeof value === 'number' ? value.toFixed(1) : (value || '--')}</div></div>`).join('')}
                </div>
                <div class="mt-4 grid grid-cols-2 md:grid-cols-3 gap-2">${inputRows.map(([label, value, decimals]) => `<div class="bg-white/60 dark:bg-gray-900/40 rounded-lg px-3 py-2"><div class="text-[10px] text-gray-500">${label}</div><div class="text-xs font-mono font-bold">${typeof value === 'number' ? formatInput(value, decimals) : (value || '--')}</div></div>`).join('')}</div>
                <div class="mt-3 text-[10px] text-gray-500">財報：${this.escapeHtml(fairValue.source_dates?.financials || '--')} · 價格：${this.escapeHtml(fairValue.source_dates?.price || '--')} · 結果為模型估計，不代表保證價格</div>
                <details class="mt-4 border-t border-orange-200/70 dark:border-orange-800/40 pt-3">
                    <summary class="cursor-pointer text-xs font-bold text-orange-700 dark:text-orange-300">算法說明</summary>
                    <div class="mt-3 space-y-2 text-[11px] leading-relaxed text-gray-600 dark:text-gray-300">
                        <p><b>主模型：Residual Income（剩餘收益）</b>。以「帳面價值 + 未來剩餘收益折現」估值：<code>RI_t = EPS_t − Ke × BVPS_(t−1)</code>，公允值為目前 BVPS 加上 5 年剩餘收益與終值的折現。</p>
                        <p><b>折現率：</b><code>Ke = 台灣無風險利率 + Beta × 台灣股票風險溢酬</code>。無法滿足必要條件時，不會把缺值當成零。</p>
                        <p><b>情境：</b>Bear／Base／Bull 使用歷史 EPS 年增率的第 25／50／75 百分位，5 年內逐步收斂至長期成長率。</p>
                        <p><b>替代模型：</b>主模型不適用時，依資料條件使用實際現金股利 DDM，或同業群組的 P/B、P/E 區間；畫面會標示實際模型。</p>
                        <p><b>資料：</b>公開季度財報、raw close、現金股利、央行無風險利率與台灣 ERP；每檔結果保留來源日期。模型估值不是保證價格。</p>
                    </div>
                </details>
            </div>`;
    },

    async renderHealthTab(container) {
        const [data, fairValue, stockInfo] = await Promise.all([
            api.fetchHealthData(this.currentSymbol),
            api.fetchFairValue(this.currentSymbol),
            api.getStockInfo(this.currentSymbol).catch(() => null)
        ]);
        if (!data) {
            container.innerHTML = `<div class="p-4 space-y-6 flex-1 overflow-y-auto no-scrollbar pb-12">${this.renderFairValueDetail(fairValue, stockInfo)}<div class="p-8 text-center text-gray-500">暫無健檢數據</div></div>`;
            return;
        }
        
        const score = data.health_score || data.score || 0;
        const status = data.signal || data.health_status || "未知";
        const risk = data.risk_level || (score > 60 ? "低風險" : "中高風險");
        const summary = data.ai_narrative || data.ai_summary || `本股健康得分為 ${score}，目前信號為 ${status}。主要支撐見 ${data.main_force?.cost || "--"}。`;

        const scoreColor = score >= 80 ? "text-green-500 border-green-500" : "text-yellow-500 border-yellow-500";
        const maintenance = data.margin?.maintenance_ratio || 0;
        const slope = data.margin?.margin_slope || 0;
        const shortMarginRatio = data.margin?.short_margin_ratio || 0;

        const chipStatus = data.chip_status || "";
        const chipWarning = data.chip_warning || "";

        const chipLabelMap = { strong: "籌碼穩定", caution: "籌碼過熱", danger: "籌碼渙散", neutral: "中性" };
        const chipColorMap = { strong: "text-green-500 bg-green-500/10 border-green-500/30", caution: "text-orange-500 bg-orange-500/10 border-orange-500/30", danger: "text-red-500 bg-red-500/10 border-red-500/30", neutral: "text-gray-500 bg-gray-500/10 border-gray-500/30" };
        const chipLabel = chipLabelMap[chipStatus] || "";
        const chipColor = chipColorMap[chipStatus] || chipColorMap.neutral;
        const showWarning = (chipStatus === "caution" || chipStatus === "danger") && chipWarning;

        const gaugeColor = shortMarginRatio < 10 ? "#22c55e" : shortMarginRatio < 30 ? "#f97316" : "#ef4444";

        container.innerHTML = `<div class="p-4 space-y-6 flex-1 overflow-y-auto no-scrollbar pb-12">
            ${data.abnormal_gm ? `
            <div class="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 flex items-start space-x-3">
                <span class="text-xl flex-none">🚨</span>
                <div>
                    <div class="text-sm font-bold text-red-500">營運異常警告</div>
                    <div class="text-xs text-red-400 mt-1">${data.gm_warning || '毛利率為負，此公司營運異常，請審慎評估'}</div>
                </div>
            </div>` : ''}
            <div class="bg-gray-50 dark:bg-gray-900 rounded-2xl p-6 border border-gray-100 dark:border-gray-800 flex items-center justify-between">
                <div class="w-24 h-24 rounded-full border-8 ${scoreColor} flex flex-col items-center justify-center bg-white dark:bg-[#0f1115]">
                    <span class="text-2xl font-bold">${score}</span><span class="text-[8px] text-gray-500 uppercase">Health</span>
                </div>
                <div class="flex-1 ml-6 space-y-2">
                    <div class="flex items-center space-x-2 bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded-lg w-fit"><span class="text-sm">💚</span><span class="text-xs text-gray-500">健康度:</span><span class="text-xs font-bold text-green-500">${status}</span></div>
                    <div class="flex items-center space-x-2 bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded-lg w-fit"><span class="text-sm">⚠️</span><span class="text-xs text-gray-500">風險度:</span><span class="text-xs font-bold text-yellow-500">${risk}</span></div>
                </div>
            </div>

            ${this.renderFairValueDetail(fairValue, stockInfo)}

            <div class="bg-gray-50 dark:bg-gray-900 rounded-2xl p-6 border border-gray-100 dark:border-gray-800">
                <div class="flex items-center justify-between mb-4">
                    <h3 class="text-sm font-bold flex items-center"><span class="mr-2">📊</span> 籌碼健檢</h3>
                    ${chipLabel ? `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full border ${chipColor}">${chipLabel}</span>` : ""}
                </div>
                <div class="flex flex-col items-center">
                    <div class="relative w-28 h-14 mb-1">
                        <svg viewBox="0 0 112 56" class="w-28 h-14">
                            <path d="M 8 56 A 48 48 0 0 1 104 56" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round" class="text-gray-200 dark:text-gray-700"/>
                            <path d="M 8 56 A 48 48 0 0 1 104 56" fill="none" stroke="${gaugeColor}" stroke-width="8" stroke-linecap="round"
                                stroke-dasharray="${Math.min(shortMarginRatio / 50 * 151, 151)} 151"/>
                            <line x1="56" y1="56" x2="56" y2="20" stroke="#374151" stroke-width="2" stroke-linecap="round"
                                transform="rotate(${Math.min(shortMarginRatio / 50 * 180, 180)} 56 56)" class="dark:stroke-gray-300"/>
                            <circle cx="56" cy="56" r="3" fill="#374151" class="dark:fill-gray-300"/>
                        </svg>
                    </div>
                    <div class="text-2xl font-black font-mono" style="color:${gaugeColor}">${shortMarginRatio.toFixed(1)}<span class="text-xs text-gray-400">%</span></div>
                    <div class="text-[10px] text-gray-500 mt-0.5">券資比</div>
                </div>
                ${showWarning ? `<div class="mt-4 flex items-start space-x-2 p-3 rounded-xl ${chipStatus === "danger" ? "bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/30" : "bg-orange-50 dark:bg-orange-900/10 border border-orange-200 dark:border-orange-800/30"}"><span class="text-sm mt-0.5">⚠️</span><span class="text-xs ${chipStatus === "danger" ? "text-red-600" : "text-orange-600"} font-medium">${chipWarning}</span></div>` : ""}
            </div>

            <div class="grid grid-cols-2 gap-3">
                <div class="bg-gray-50 dark:bg-gray-900 p-4 rounded-xl border border-gray-100 dark:border-gray-800">
                    <div class="text-[10px] text-gray-500 mb-1">融資維持率</div>
                    <div class="text-lg font-bold ${maintenance < 145 ? "text-red-500" : "text-green-500"}">${maintenance.toFixed(1)}%</div>
                    <div class="text-[10px] text-gray-400">${maintenance < 140 ? "⚠️ 斷頭預警" : "狀態穩定"}</div>
                </div>
                <div class="bg-gray-50 dark:bg-gray-900 p-4 rounded-xl border border-gray-100 dark:border-gray-800">
                    <div class="text-[10px] text-gray-500 mb-1">5日融資斜率</div>
                    <div class="text-lg font-bold ${slope > 0 ? "text-red-500" : "text-blue-500"}">${slope > 0 ? "+" : ""}${slope.toFixed(0)}</div>
                    <div class="text-[10px] text-gray-400">${slope > 1000 ? "融資爆增" : "籌碼平穩"}</div>
                </div>
            </div>

            ${this.renderMarginPressureSection(data)}
        </div>`;
    },

    renderMarginPressureSection(data) {
        const m = data.margin || {};
        const score = m.margin_pressure_score;
        const level = m.margin_pressure_level || 'LOW';
        if (score == null) return '';

        const levelColors = { HIGH: 'text-red-500 bg-red-500/10', CAUTION: 'text-orange-500 bg-orange-500/10', NORMAL: 'text-yellow-500 bg-yellow-500/10', LOW: 'text-green-500 bg-green-500/10' };
        const levelLabels = { HIGH: '高', CAUTION: '注意', NORMAL: '正常', LOW: '低' };
        const lColor = levelColors[level] || levelColors.LOW;
        const lLabel = levelLabels[level] || '低';
        const barColor = level === 'HIGH' ? '#ef4444' : level === 'CAUTION' ? '#f97316' : level === 'NORMAL' ? '#eab308' : '#22c55e';

        const usage = m.margin_usage_rate;
        const chg5d = m.margin_balance_change_5d;
        const delta5d = m.margin_balance_delta_5d || 0;
        const buyRatio = m.margin_buy_volume_ratio;
        const divergence = m.margin_price_divergence_5d;

        const divLabels = { PRICE_UP_MARGIN_UP: '價漲融資增', PRICE_UP_MARGIN_DOWN: '價漲融資減', PRICE_DOWN_MARGIN_UP: '價跌融資增', PRICE_DOWN_MARGIN_DOWN: '價跌融資減' };
        const divColors = { PRICE_DOWN_MARGIN_UP: 'text-red-500', PRICE_UP_MARGIN_DOWN: 'text-green-500', PRICE_UP_MARGIN_UP: 'text-orange-500', PRICE_DOWN_MARGIN_DOWN: 'text-blue-500' };

        return `
            <div class="bg-gray-50 dark:bg-gray-900 rounded-2xl p-6 border border-gray-100 dark:border-gray-800">
                <h3 class="text-sm font-bold mb-4 flex items-center"><span class="mr-2">🔴</span> 融資壓力監測</h3>
                <div class="mb-4">
                    <div class="flex items-center justify-between mb-1">
                        <span class="text-[10px] text-gray-500">融資壓力分數</span>
                        <span class="text-lg font-black ${lColor.split(' ')[0]}">${score}<span class="text-xs text-gray-400 ml-1">/100</span></span>
                    </div>
                    <div class="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div class="h-full rounded-full transition-all" style="width:${Math.min(score, 100)}%;background:${barColor}"></div>
                    </div>
                    <div class="mt-1 inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${lColor}">${lLabel}</div>
                </div>
                <div class="grid grid-cols-2 gap-3">
                    ${usage != null ? `
                    <div class="bg-gray-100 dark:bg-gray-800 p-3 rounded-xl">
                        <div class="text-[10px] text-gray-500 mb-1">融資使用率</div>
                        <div class="text-base font-bold ${usage > 0.5 ? 'text-red-500' : 'text-blue-500'}">${(usage * 100).toFixed(1)}%</div>
                        <div class="text-[10px] text-gray-400">${usage > 0.5 ? '使用率偏高' : '使用率正常'}</div>
                    </div>` : ''}
                    ${chg5d != null ? `
                    <div class="bg-gray-100 dark:bg-gray-800 p-3 rounded-xl">
                        <div class="text-[10px] text-gray-500 mb-1">5日融資變化</div>
                        <div class="text-base font-bold ${chg5d > 0 ? 'text-red-500' : 'text-green-500'}">${(chg5d > 0 ? '+' : '')}${(chg5d * 100).toFixed(1)}%</div>
                        <div class="text-[10px] text-gray-400">${Math.abs(delta5d).toLocaleString()}張</div>
                    </div>` : ''}
                    ${buyRatio != null ? `
                    <div class="bg-gray-100 dark:bg-gray-800 p-3 rounded-xl">
                        <div class="text-[10px] text-gray-500 mb-1">融資買盤佔比</div>
                        <div class="text-base font-bold ${buyRatio > 0.2 ? 'text-orange-500' : 'text-blue-500'}">${(buyRatio * 100).toFixed(1)}%</div>
                        <div class="text-[10px] text-gray-400">${buyRatio > 0.2 ? '買盤偏高' : '買盤正常'}</div>
                    </div>` : ''}
                    ${divergence ? `
                    <div class="bg-gray-100 dark:bg-gray-800 p-3 rounded-xl">
                        <div class="text-[10px] text-gray-500 mb-1">價量背離(5日)</div>
                        <div class="text-base font-bold ${divColors[divergence] || 'text-gray-500'}">${divLabels[divergence] || divergence}</div>
                        <div class="text-[10px] text-gray-400">${divergence === 'PRICE_DOWN_MARGIN_UP' ? '散戶接刀' : divergence === 'PRICE_UP_MARGIN_DOWN' ? '籌碼沉澱' : divergence === 'PRICE_UP_MARGIN_UP' ? '籌碼過熱' : '去槓桿'}</div>
                    </div>` : ''}
                </div>
            </div>

            ${this.renderCostEstimateSection(data)}
            ${this.renderSignalsAndPercentiles(data)}
            </div>`;
    },

    renderCostEstimateSection(data) {
        const m = data.margin || {};
        const conf = m.margin_model_confidence;
        const cost = m.estimated_margin_cost;
        if (conf == null || conf <= 0 || cost == null) return '';

        const ret = m.estimated_margin_return;
        const cr60 = m.estimated_collateral_ratio_60;
        const wp130 = m.estimated_warning_price_130;
        const dw130 = m.distance_to_warning_130;
        const close = data.close || 0;

        const confLabel = conf > 0.7 ? '高' : conf > 0.4 ? '中' : '低';
        const confColor = conf > 0.7 ? 'text-green-500' : conf > 0.4 ? 'text-orange-500' : 'text-red-500';

        return `
            <div class="bg-gray-50 dark:bg-gray-900 rounded-2xl p-6 border border-yellow-200 dark:border-yellow-800/30">
                <h3 class="text-sm font-bold mb-4 flex items-center"><span class="mr-2">📐</span> 推估融資成本
                    <span class="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded ${confColor} bg-opacity-10">可信度:${confLabel}</span>
                </h3>

                <div class="flex items-center justify-between mb-4 p-3 bg-gray-100 dark:bg-gray-800 rounded-xl">
                    <div>
                        <div class="text-[10px] text-gray-500">推估平均成本</div>
                        <div class="text-lg font-black font-mono">${cost.toFixed(2)}</div>
                    </div>
                    <div class="text-right">
                        <div class="text-[10px] text-gray-500">模型可信度</div>
                        <div class="text-base font-bold ${confColor}">${confLabel} (${(conf * 100).toFixed(0)}%)</div>
                    </div>
                </div>

                <div class="grid grid-cols-2 gap-3">
                    ${ret != null ? `
                    <div class="bg-gray-100 dark:bg-gray-800 p-3 rounded-xl">
                        <div class="text-[10px] text-gray-500 mb-1">推估融資損益</div>
                        <div class="text-base font-bold ${ret < 0 ? 'text-red-500' : 'text-green-500'}">${(ret > 0 ? '+' : '')}${(ret * 100).toFixed(1)}%</div>
                        <div class="text-[10px] text-gray-400">${ret < 0 ? '庫存虧損中' : '庫存獲利中'}</div>
                    </div>` : ''}
                    ${cr60 != null ? `
                    <div class="bg-gray-100 dark:bg-gray-800 p-3 rounded-xl">
                        <div class="text-[10px] text-gray-500 mb-1">推估擔保比率(60%)</div>
                        <div class="text-base font-bold ${cr60 < 1.5 ? 'text-red-500' : 'text-green-500'}">${(cr60 * 100).toFixed(0)}%</div>
                        <div class="text-[10px] text-gray-400">${cr60 < 1.5 ? '接近警戒' : '安全'}</div>
                    </div>` : ''}
                    ${wp130 && close ? `
                    <div class="bg-gray-100 dark:bg-gray-800 p-3 rounded-xl">
                        <div class="text-[10px] text-gray-500 mb-1">警戒價(130%)</div>
                        <div class="text-base font-bold text-orange-500">${wp130.toFixed(2)}</div>
                        <div class="text-[10px] text-gray-400">距離 ${((close / wp130 - 1) * 100).toFixed(1)}%</div>
                    </div>` : ''}
                    ${dw130 != null ? `
                    <div class="bg-gray-100 dark:bg-gray-800 p-3 rounded-xl">
                        <div class="text-[10px] text-gray-500 mb-1">距離警戒(130%)</div>
                        <div class="text-base font-bold ${dw130 < 0.05 ? 'text-red-500' : 'text-blue-500'}">${(dw130 > 0 ? '+' : '')}${(dw130 * 100).toFixed(1)}%</div>
                        <div class="text-[10px] text-gray-400">${dw130 < 0.05 ? '接近壓力區' : '尚屬安全'}</div>
                    </div>` : ''}
                </div>

                <div class="mt-3 text-[9px] text-gray-400 leading-tight">
                    推估成本與擔保比率由公開融資流量模型計算，不代表券商實際信用帳戶維持率。
                </div>
            </div>`;
    },

    renderSignalsAndPercentiles(data) {
        const m = data.margin || {};
        const signals = data.margin_signals || [];
        const pctile = m.estimated_margin_return_percentile_250;
        const zscore = m.margin_balance_change_zscore_60;

        let html = '';

        // Signals
        const signalMap = {
            MARGIN_CHASING: { label: '融資追高', color: 'text-orange-500 bg-orange-500/10' },
            MARGIN_AVERAGING_DOWN: { label: '融資攤平', color: 'text-red-500 bg-red-500/10' },
            MARGIN_DELEVERAGING: { label: '融資去槓桿', color: 'text-purple-500 bg-purple-500/10' },
            POSSIBLE_MARGIN_CALL_PRESSURE: { label: '疑似斷頭壓力', color: 'text-red-600 bg-red-600/10' },
            MARGIN_STRUCTURE_IMPROVING: { label: '籌碼改善', color: 'text-green-500 bg-green-500/10' }
        };

        if (signals.length > 0) {
            html += `<div class="bg-gray-50 dark:bg-gray-900 rounded-2xl p-6 border border-gray-100 dark:border-gray-800">
                <h3 class="text-sm font-bold mb-3 flex items-center"><span class="mr-2">🚨</span> 融資訊號</h3>
                <div class="flex flex-wrap gap-2">`;
            signals.forEach(sig => {
                const info = signalMap[sig] || { label: sig, color: 'text-gray-500 bg-gray-500/10' };
                html += `<span class="text-[10px] font-bold px-2.5 py-1 rounded-full ${info.color}">${info.label}</span>`;
            });
            html += `</div></div>`;
        }

        // Percentiles
        if (pctile != null || zscore != null) {
            html += `<div class="bg-gray-50 dark:bg-gray-900 rounded-2xl p-6 border border-gray-100 dark:border-gray-800">
                <h3 class="text-sm font-bold mb-3 flex items-center"><span class="mr-2">📊</span> 歷史標準化指標</h3>
                <div class="grid grid-cols-2 gap-3">`;
            if (pctile != null) {
                html += `<div class="bg-gray-100 dark:bg-gray-800 p-3 rounded-xl">
                    <div class="text-[10px] text-gray-500 mb-1">推估報酬百分位(250日)</div>
                    <div class="text-base font-bold">${pctile.toFixed(1)}%</div>
                </div>`;
            }
            if (zscore != null) {
                html += `<div class="bg-gray-100 dark:bg-gray-800 p-3 rounded-xl">
                    <div class="text-[10px] text-gray-500 mb-1">融資變化Z-score(60日)</div>
                    <div class="text-base font-bold ${zscore > 2 ? 'text-red-500' : zscore < -2 ? 'text-green-500' : ''}">${zscore.toFixed(2)}</div>
                </div>`;
            }
            html += `</div></div>`;
        }

        return html;
    },

    async renderMarketTab(container) {
        // 🚀 從 api.fetchQuotes 獲取真實報價數據來填充盤面
        const quoteMap = await api.fetchQuotes([this.currentSymbol]);
        const q = quoteMap[this.currentSymbol] || {};
        
        const priceStyle = getPriceChangeStyle(parseFloat(q.price), parseFloat(q.referencePrice), this.currentSymbol);
        const priceSpanClass = priceStyle.isLimit
            ? `${priceStyle.textClass} ${priceStyle.bgClass} rounded px-2 py-0.5`
            : priceStyle.textClass;
        const changeSpanClass = priceStyle.isLimit
            ? `${priceStyle.textClass} ${priceStyle.bgClass} rounded px-2 py-0.5`
            : priceStyle.textClass;

        container.innerHTML = `<div class="p-4 space-y-6">
            <h3 class="text-orange-500 font-bold flex items-center mb-4"><span class="mr-2">⏱️</span> 即時盤面指標</h3>
            <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div class="bg-gray-50 dark:bg-gray-900 p-3 rounded-xl border border-gray-100 dark:border-gray-800 flex flex-col items-center">
                    <span class="text-xs text-gray-500 mb-1">成交價</span><span class="text-lg font-bold ${priceSpanClass}">${this.formatValue(q.price)}</span>
                </div>
                <div class="bg-gray-50 dark:bg-gray-900 p-3 rounded-xl border border-gray-100 dark:border-gray-800 flex flex-col items-center">
                    <span class="text-xs text-gray-500 mb-1">今日漲跌</span><span class="text-lg font-bold ${changeSpanClass}">${q.changePercent}%</span>
                </div>
                <div class="bg-gray-50 dark:bg-gray-900 p-3 rounded-xl border border-gray-100 dark:border-gray-800 flex flex-col items-center">
                    <span class="text-xs text-gray-500 mb-1">數據源</span><span class="text-[10px] font-bold text-blue-400">${q.source || 'OFFLINE'}</span>
                </div>
            </div>
            <div class="p-4 bg-blue-50/30 dark:bg-blue-900/5 rounded-xl border border-blue-100 dark:border-blue-800/20">
                <p class="text-xs text-gray-500">提示：更詳細的即時內外盤、振幅與即時分價圖僅在盤中交易時段透過 Fugle API 完整呈現。</p>
            </div>
        </div>`;
    },

    async renderNewsTab(container) {
        container.innerHTML = '<div class="p-4 space-y-4"><div class="text-center py-8 text-gray-500">載入新聞中...</div></div>';
        try {
            const symbol = this.currentSymbol.split('.')[0];
            const rssUrl = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${symbol}.TW&region=US&lang=en-US`;
            const response = await fetch(rssUrl);
            const xmlText = await response.text();
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
            const items = xmlDoc.querySelectorAll('item');

            if (!items || items.length === 0) {
                container.innerHTML = `<div class="p-8 text-center text-gray-500">目前無相關新聞</div>`;
                return;
            }

            const news = Array.from(items).map(item => {
                const title = item.querySelector('title')?.textContent || '';
                const description = item.querySelector('description')?.textContent || '';
                const link = item.querySelector('link')?.textContent || '';
                const pubDate = item.querySelector('pubDate')?.textContent || '';
                const source = item.querySelector('source')?.textContent || 'Yahoo Finance';
                const date = pubDate ? new Date(pubDate).toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' }) : '';
                return { title, description, link, pubDate, source, date };
            }).filter(n => n.title);

            const dateGroups = {};
            news.forEach(n => {
                if (!dateGroups[n.date]) dateGroups[n.date] = [];
                dateGroups[n.date].push(n);
            });

            container.innerHTML = `
                <div class="p-4 space-y-4 flex-1 overflow-y-auto no-scrollbar pb-12">
                    <h3 class="text-lg font-bold flex items-center">
                        <svg class="w-5 h-5 mr-2 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"/></svg>
                        最新新聞
                    </h3>
                    ${Object.entries(dateGroups).map(([date, items]) => `
                        <div>
                            <div class="text-xs text-gray-400 font-bold mb-2 px-1">${date}</div>
                            <div class="space-y-2">
                                ${items.map(item => `
                                    <a href="${item.link}" target="_blank" rel="noopener noreferrer" class="block bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                                        <div class="flex items-start">
                                            <span class="text-lg mr-3 mt-0.5 flex-none">📰</span>
                                            <div class="min-w-0 flex-1">
                                                <div class="text-sm font-bold dark:text-white leading-snug line-clamp-2 mb-1">${this.escapeHtml(item.title)}</div>
                                                <div class="flex items-center space-x-2 text-[10px] text-gray-400">
                                                    <span class="font-medium">${this.escapeHtml(item.source)}</span>
                                                    <span>·</span>
                                                    <span>${this.escapeHtml(item.description.replace(/<[^>]+>/g, '').substring(0, 120))}${item.description.replace(/<[^>]+>/g, '').length > 120 ? '...' : ''}</span>
                                                </div>
                                            </div>
                                            <svg class="w-4 h-4 text-gray-300 dark:text-gray-600 flex-none ml-2 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                                        </div>
                                    </a>
                                `).join('')}
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
        } catch(e) {
            console.warn('RSS fetch failed:', e);
            container.innerHTML = `<div class="p-8 text-center text-gray-500">新聞資料暫時無法取得，請稍後再試</div>`;
        }
    },

    async renderRevenueTab(container) {
        const data = await api.fetchFinancials(this.currentSymbol, 'monthly');
        if (!data || !data.data) { container.innerHTML = `<div class="p-8 text-center text-gray-500">暫無營收數據</div>`; return; }
        container.innerHTML = `<div class="p-4 space-y-4 flex-1 overflow-y-auto no-scrollbar pb-12">
            <h3 class="text-lg font-bold">營收分析 - ${this.currentSymbol}</h3>
            <div id="revenue-chart" class="w-full h-48 bg-white dark:bg-gray-900 rounded-2xl border p-2"></div>
            <div class="overflow-x-auto bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
                <table class="w-full text-xs text-left"><thead class="bg-gray-50 dark:bg-gray-800 text-gray-500"><tr><th class="px-4 py-3">月份</th><th class="px-4 py-3 text-right">營收</th><th class="px-4 py-3 text-right">YoY</th></tr></thead>
                <tbody class="divide-y divide-gray-100 dark:divide-gray-800">${data.data.map(item => `<tr><td class="px-4 py-3">${item.period}</td><td class="px-4 py-3 text-right font-bold">${this.formatValue(item.value, 0)}</td><td class="px-4 py-3 text-right ${parseFloat(item.yoy) >= 0 ? 'text-red-500' : 'text-green-500'}">${item.yoy}%</td></tr>`).join('')}</tbody></table>
            </div>
        </div>`;
        setTimeout(() => {
            const chart = echarts.init(document.getElementById('revenue-chart'), document.documentElement.classList.contains('dark') ? 'dark' : null);
            const sorted = [...data.data].sort((a, b) => a.date.localeCompare(b.date));
            chart.setOption({ backgroundColor: 'transparent', grid: { top: 20, bottom: 70, left: 50, right: 40 }, tooltip: { trigger: 'axis' }, xAxis: { type: 'category', data: sorted.map(d => d.period), axisLabel: { rotate: 35, fontSize: 10, margin: 15 } }, yAxis: [{ type: 'value', name: '營收', splitLine: { show: false } }, { type: 'value', name: 'YoY', axisLabel: { formatter: '{value}%' } }], series: [{ name: '營收', type: 'bar', data: sorted.map(d => d.value), itemStyle: { color: '#3b82f6' } }, { name: 'YoY', type: 'line', yAxisIndex: 1, data: sorted.map(d => d.yoy), itemStyle: { color: '#ef4444' } }] });
        }, 100);
    },

    async renderProfitTab(container) {
        const data = await api.fetchFinancials(this.currentSymbol, 'quarterly');
        if (!data || !data.data) { container.innerHTML = `<div class="p-8 text-center text-gray-500">暫無獲利數據</div>`; return; }
        container.innerHTML = `<div class="p-4 space-y-6 flex-1 overflow-y-auto no-scrollbar pb-12">
            <h3 class="text-lg font-bold">獲利分析 - ${this.currentSymbol}</h3>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div class="space-y-2"><h4 class="text-[10px] font-bold text-blue-500">EPS</h4><div id="eps-chart" class="w-full h-40 bg-white dark:bg-gray-900 rounded-2xl border p-2"></div></div>
                <div class="space-y-2"><h4 class="text-[10px] font-bold text-green-500">Margins</h4><div id="margins-chart" class="w-full h-40 bg-white dark:bg-gray-900 rounded-2xl border p-2"></div></div>
                <div class="space-y-2"><h4 class="text-[10px] font-bold text-orange-500">ROE/ROA</h4><div id="returns-chart" class="w-full h-40 bg-white dark:bg-gray-900 rounded-2xl border p-2"></div></div>
            </div>
            <div class="overflow-x-auto bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800"><table class="w-full text-xs text-left"><thead class="bg-gray-50 dark:bg-gray-800 text-gray-500"><tr><th class="px-4 py-3">季度</th><th class="px-4 py-3 text-right">EPS</th><th class="px-4 py-3 text-right">毛利率</th><th class="px-4 py-3 text-right">ROE</th></tr></thead><tbody class="divide-y divide-gray-100 dark:divide-gray-800">${data.data.map(item => `<tr><td class="px-4 py-3">${item.period}</td><td class="px-4 py-3 text-right font-bold">${this.formatValue(item.value)}</td><td class="px-4 py-3 text-right">${item.gm}%</td><td class="px-4 py-3 text-right text-orange-500">${item.roe}%</td></tr>`).join('')}</tbody></table></div>
        </div>`;
        setTimeout(() => {
            const isDark = document.documentElement.classList.contains('dark');
            const sorted = [...data.data].sort((a, b) => a.date.localeCompare(b.date));
            const common = { backgroundColor: 'transparent', grid: { top: 20, bottom: 65, left: 35, right: 5 }, tooltip: { trigger: 'axis' }, xAxis: { type: 'category', data: sorted.map(d => d.period), axisLabel: { fontSize: 8, rotate: 35, margin: 12 } } };
            const epsC = echarts.init(document.getElementById('eps-chart'), isDark ? 'dark' : null); epsC.setOption({ ...common, series: [{ name: 'EPS', type: 'bar', data: sorted.map(d => d.value), itemStyle: { color: '#3b82f6' } }], yAxis: { type: 'value', splitLine: { show: false } } });
            const margC = echarts.init(document.getElementById('margins-chart'), isDark ? 'dark' : null); margC.setOption({ ...common, legend: { data: ['毛利', '營益', '淨利'], bottom: 0, textStyle: { fontSize: 8 } }, series: [{ name: '毛利', type: 'line', data: sorted.map(d => d.gm), smooth: true }, { name: '營益', type: 'line', data: sorted.map(d => d.om), smooth: true }, { name: '淨利', type: 'line', data: sorted.map(d => d.nm), smooth: true }], yAxis: { type: 'value' } });
            const retC = echarts.init(document.getElementById('returns-chart'), isDark ? 'dark' : null); retC.setOption({ ...common, legend: { data: ['ROE', 'ROA'], bottom: 0, textStyle: { fontSize: 8 } }, series: [{ name: 'ROE', type: 'line', data: sorted.map(d => d.roe), smooth: true }, { name: 'ROA', type: 'line', data: sorted.map(d => d.roa), smooth: true }], yAxis: { type: 'value' } });
        }, 100);
    },

    async renderDividendTab(container) {
        const data = await api.fetchFinancials(this.currentSymbol, 'dividends');
        if (!data || !data.data) { container.innerHTML = `<div class="p-8 text-center text-gray-500">暫無股利數據</div>`; return; }
        container.innerHTML = `<div class="p-4 space-y-4 flex-1 overflow-y-auto no-scrollbar pb-12">
            <h3 class="text-lg font-bold">股利政策 - ${this.currentSymbol}</h3>
            <div id="dividend-chart" class="w-full h-48 bg-white dark:bg-gray-900 rounded-2xl border p-2"></div>
            <div class="overflow-x-auto bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800"><table class="w-full text-xs text-left"><thead class="bg-gray-50 dark:bg-gray-800 text-gray-500"><tr><th class="px-4 py-3">除息日</th><th class="px-4 py-3 text-right">現金</th><th class="px-4 py-3 text-right">合計</th></tr></thead><tbody class="divide-y divide-gray-100 dark:divide-gray-800">${data.data.map(item => `<tr><td class="px-4 py-3">${item.date}</td><td class="px-4 py-3 text-right">${this.formatValue(item.cash)}</td><td class="px-4 py-3 text-right font-bold text-blue-500">${this.formatValue(item.value)}</td></tr>`).join('')}</tbody></table></div>
        </div>`;
        setTimeout(() => {
            const chart = echarts.init(document.getElementById('dividend-chart'), document.documentElement.classList.contains('dark') ? 'dark' : null);
            const sorted = [...data.data].sort((a, b) => a.date.localeCompare(b.date));
            chart.setOption({ backgroundColor: 'transparent', grid: { top: 20, bottom: 70, left: 40, right: 20 }, tooltip: { trigger: 'axis' }, xAxis: { type: 'category', data: sorted.map(d => d.date), axisLabel: { rotate: 45, fontSize: 9, margin: 15 } }, yAxis: { type: 'value' }, series: [{ name: '股利', type: 'bar', data: sorted.map(d => d.value), itemStyle: { color: '#3b82f6' } }] });
        }, 100);
    },

    async renderShareholderTab(container) {
        const [data, chartData] = await Promise.all([api.fetchShareholders(this.currentSymbol), api.fetchChart(this.currentSymbol).catch(() => null)]);
        if (!data) { container.innerHTML = `<div class="p-8 text-center text-gray-500">暫無大股東數據</div>`; return; }
        
        container.innerHTML = `<div class="p-4 flex flex-col h-full space-y-4 overflow-y-auto no-scrollbar pb-12">
            <h3 class="text-lg font-bold">股權分佈 - ${this.currentSymbol}</h3>
            <div id="shareholder-chart" class="w-full h-56 bg-white dark:bg-gray-900 rounded-2xl border p-2"></div>
            <div class="grid grid-cols-2 gap-3 pb-8">${(data.recent || []).slice(0, 4).map(item => `<div class="bg-gray-50 dark:bg-gray-800 p-3 rounded-xl border border-gray-100 dark:border-gray-700"><div class="text-[10px] text-gray-500 mb-1">${item.date}</div><div class="flex justify-between items-end"><div><div class="text-base font-bold">${item.percentage}%</div><div class="text-[9px] text-gray-400">大股東持股</div></div><div class="text-xs ${parseFloat(item.diff) >= 0 ? 'text-red-500' : 'text-green-500'}">${parseFloat(item.diff) > 0 ? '▲' : '▼'} ${Math.abs(item.diff)}%</div></div></div>`).join('')}</div>
        </div>`;

        setTimeout(() => {
            const chartDom = document.getElementById('shareholder-chart');
            if (!chartDom) return;
            const chart = echarts.init(chartDom, document.documentElement.classList.contains('dark') ? 'dark' : null);
            
            // 🚀 v2.2.3: 極致強健的日期解析器 (解決 NaN/Invalid Date 崩潰問題)
            const parseToDate = (dateStr) => {
                if (!dateStr) return null;
                try {
                    if (dateStr.includes('-W')) {
                        const parts = dateStr.split('-W');
                        if (parts.length === 2) {
                            const y = parseInt(parts[0]), w = parseInt(parts[1]);
                            const d = new Date(y, 0, 1 + (w - 1) * 7);
                            const day = d.getDay();
                            d.setDate(d.getDate() + (5 - day)); // 推算週五
                            return isNaN(d.getTime()) ? null : d;
                        }
                    }
                    const d = new Date(dateStr);
                    return isNaN(d.getTime()) ? null : d;
                } catch(e) { return null; }
            };

            // 1. 過濾並排序
            const rawItems = (data.recent || []).filter(item => item.date && item.percentage !== undefined);
            const sorted = rawItems.sort((a, b) => {
                const da = parseToDate(a.date), db = parseToDate(b.date);
                if (!da || !db) return 0;
                return da - db;
            });
            
            if (sorted.length === 0) {
                chartDom.innerHTML = `<div class="flex items-center justify-center h-full text-gray-500 text-xs">數據格式異常</div>`;
                return;
            }

            const priceMap = {}; 
            if (chartData && (chartData.timestamp || chartData.timestamps)) { 
                const tsList = chartData.timestamp || chartData.timestamps;
                const clList = chartData.close || [];
                tsList.forEach((ts, idx) => { 
                    try {
                        const iso = new Date(ts * 1000).toISOString().split('T')[0];
                        priceMap[iso] = clList[idx]; 
                    } catch(e) {}
                }); 
            }

            const lineData = sorted.map(d => {
                const targetDate = parseToDate(d.date);
                if (!targetDate) return null;
                
                const targetISO = targetDate.toISOString().split('T')[0];
                if (priceMap[targetISO]) return priceMap[targetISO];
                
                // 擴大搜索範圍至前後 10 天
                const t = targetDate.getTime();
                let closestPrice = null, minDiff = Infinity;
                Object.keys(priceMap).forEach(pd => {
                    const diff = Math.abs(new Date(pd).getTime() - t);
                    if (diff < minDiff && diff <= 86400000 * 10) {
                        minDiff = diff; closestPrice = priceMap[pd];
                    }
                });
                return closestPrice;
            });

            chart.setOption({ 
                backgroundColor: 'transparent', 
                grid: { top: 40, bottom: 80, left: 45, right: 45 }, 
                tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } }, 
                legend: { data: ['持股 %', '股價'], bottom: 5, textStyle: { fontSize: 10 } }, 
                xAxis: { 
                    type: 'category', 
                    data: sorted.map(d => d.date), 
                    axisLabel: { 
                        rotate: 35, 
                        fontSize: 9, 
                        margin: 15, 
                        interval: sorted.length > 15 ? 'auto' : 0 
                    } 
                }, 
                yAxis: [
                    { type: 'value', name: '持股 %', scale: true, position: 'left', splitLine: { show: false }, axisLabel: { fontSize: 9 } }, 
                    { type: 'value', name: '股價', scale: true, position: 'right', splitLine: { lineStyle: { type: 'dashed', opacity: 0.1 } }, axisLabel: { fontSize: 9 } }
                ], 
                series: [
                    { name: '持股 %', type: 'bar', data: sorted.map(d => d.percentage), itemStyle: { color: '#3b82f6', borderRadius: [3, 3, 0, 0] }, barWidth: sorted.length > 20 ? '50%' : '30%' }, 
                    { name: '股價', type: 'line', yAxisIndex: 1, data: lineData, smooth: true, symbol: 'circle', symbolSize: 3, itemStyle: { color: '#ef4444' }, lineStyle: { width: 2 } }
                ] 
            });
            window.addEventListener('resize', () => chart.resize());
        }, 150);
    },

    parseDate(rawDate) {
        if (!rawDate) return '未知日期';
        const s = String(rawDate);
        if (s.length === 8 && /^\d+$/.test(s)) return `${s.substring(0, 4)}/${s.substring(4, 6)}/${s.substring(6, 8)}`;
        if (typeof rawDate === 'number' && rawDate > 1000000000) { const d = new Date(rawDate < 10000000000 ? rawDate * 1000 : rawDate); return d.toLocaleDateString('zh-TW'); }
        const d = new Date(rawDate); return isNaN(d.getTime()) ? s : d.toLocaleDateString('zh-TW');
    },

    async renderTradesTab(container) {
        try {
            const trades = await db.getAllTrades();
            await CorporateActions.loadCorporateActions([this.currentSymbol]);
            const timeline = CorporateActions.buildTransactionTimeline(trades, this.currentSymbol);
            if (timeline.length === 0) { container.innerHTML = `<div class="p-8 text-center text-gray-500">尚無交易紀錄。</div>`; return; }
            timeline.sort((a, b) => b.date.localeCompare(a.date));
            const self = this;
            container.innerHTML = `<div class="p-4 flex-1 overflow-y-auto no-scrollbar pb-20"><div class="space-y-4">
                ${timeline.map(item => {
                    if (item.type === 'TRADE') {
                        const trade = item.data;
                        const id = trade.id;
                        const side = (trade.side || trade.type || '未知').replace('SIDE_', '');
                        const qty = trade.quantity || trade.shares || 0;
                        const price = trade.price || 0;
                        return `<div class="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-100 dark:border-gray-800">
                            <div class="flex justify-between items-center">
                                <div>
                                    <div class="text-[10px] text-gray-500">${self.parseDate(item.date)}</div>
                                    <div class="text-sm font-bold ${side.includes('買') || side.includes('BUY') ? 'text-red-500' : 'text-green-500'}">${side}</div>
                                </div>
                                <div class="text-right">
                                    <div class="text-sm font-bold dark:text-white">${self.formatValue(qty, 0)} 股</div>
                                    <div class="text-xs text-gray-400">$${self.formatValue(price)}</div>
                                </div>
                            </div>
                            <div class="flex justify-end space-x-2 mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                                <button class="edit-trade text-xs text-blue-500 hover:text-blue-400 font-medium" data-id="${id}">✏️ 編輯</button>
                                <button class="delete-trade text-xs text-red-500 hover:text-red-400 font-medium" data-id="${id}">🗑️ 刪除</button>
                            </div>
                        </div>`;
                    } else {
                        return `<div class="p-3 bg-blue-50/50 dark:bg-blue-900/10 rounded-xl border border-dashed border-blue-200 dark:border-blue-800/50"><div class="text-[10px] text-gray-500">${self.parseDate(item.date)}</div><div class="text-xs font-bold text-blue-600 dark:text-blue-400">企業行為：${item.data.type || '股利/拆分'}</div></div>`;
                    }
                }).join('')}
            </div></div>`;

            // Bind edit buttons
            container.querySelectorAll('.edit-trade').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const rawId = btn.dataset.id;
                    const id = isNaN(Number(rawId)) ? rawId : Number(rawId);
                    const allTrades = await db.getAllTrades();
                    const trade = allTrades.find(t => t.id === id);
                    if (!trade) { alert('找不到此交易 (id=' + rawId + ')'); return; }
                    self.showEditModal(trade, id, container);
                });
            });

            // Bind delete buttons
            container.querySelectorAll('.delete-trade').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const rawId = btn.dataset.id;
                    const id = isNaN(Number(rawId)) ? rawId : Number(rawId);
                    if (!confirm('確定要刪除此筆交易嗎？')) return;
                    await db.deleteTrade(id);
                    if (typeof window.init === 'function') window.init();
                    self.renderTradesTab(container);
                });
            });
        } catch(err) { container.innerHTML = `<div class="p-8 text-center text-red-500">載入失敗: ${err.message}</div>`; }
    },

    async renderFundamentalTab(container) {
        const [stockInfo, quarterly, quoteMap, etfSnapshot, etfRebalance, stocksMeta, fairValue] = await Promise.all([
            api.getStockInfo(this.currentSymbol),
            api.fetchFinancials(this.currentSymbol, 'quarterly'),
            api.fetchQuotes([this.currentSymbol]),
            api.fetchETFHoldings(),
            api.fetchETFRebalance(),
            api.getStocksMeta(),
            api.fetchFairValue(this.currentSymbol)
        ]);

        const isETF = stockInfo?.official_sector === 'ETF' || stockInfo?.industry === 'ETF';
        const fairValueMethodLabels = {
            residual_income: 'Residual Income（剩餘收益）',
            dividend_discount: 'Dividend Discount（股利折現）',
            relative_pb: 'Relative P/B（同業股價淨值比）',
            relative_pe: 'Relative P/E（同業本益比）'
        };
        if (isETF && etfSnapshot?.[this.currentSymbol]) {
            this.renderETFComposition(
                container,
                etfSnapshot[this.currentSymbol],
                etfRebalance?.[this.currentSymbol],
                etfRebalance !== null,
                stocksMeta
            );
            return;
        }

        const price = quoteMap[this.currentSymbol]?.price || 0;
        const sorted = (quarterly?.data || []).sort((a, b) => b.date.localeCompare(a.date));
        const q4Record = sorted.find(q => q.period && q.period.endsWith('-Q4'));
        let ttmEps = 0;
        if (q4Record && q4Record.eps > 0) {
            const fyYear = q4Record.period.substring(0, 4);
            const q1Record = sorted.find(q => q.period === fyYear + '-Q1');
            const base = q1Record && q1Record.eps > 0 ? q4Record.eps - q1Record.eps : q4Record.eps;
            const newer = sorted.filter(q => q.period > q4Record.period && !q.period.endsWith('-Q4'));
            ttmEps = base + newer.reduce((s, q) => s + (q.eps || 0), 0);
        }
        const per = price > 0 && ttmEps > 0 ? (price / ttmEps).toFixed(2) : '--';
        const latest = sorted[0] || {};
        const classification = this.buildClassification(stockInfo);
        const sector = classification.officialSector || '--';
        const subIndustry = classification.subIndustry || classification.primaryTheme || '--';

        const etfHoldings = etfSnapshot ? Object.entries(etfSnapshot)
            .filter(([, etf]) => etf.holdings?.some(h => (h.stock_id || '') === this.currentSymbol.split('.')[0]))
            .map(([id, etf]) => ({
                id,
                name: etf.name,
                weight: etf.holdings.find(h => h.stock_id === this.currentSymbol.split('.')[0])?.weight || 0
            }))
            .sort((a, b) => b.weight - a.weight) : [];
        const etfTotalWeight = etfHoldings.reduce((s, h) => s + h.weight, 0);

        container.innerHTML = `
            <div class="p-4 space-y-6 flex-1 overflow-y-auto no-scrollbar pb-12">
                <div class="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5">
                    <h3 class="text-lg font-bold mb-4">${stockInfo?.name || this.currentSymbol}</h3>
                    ${this.renderClassificationPanel(stockInfo)}
                </div>

                <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div class="bg-gray-50 dark:bg-gray-900 p-4 rounded-xl border border-gray-100 dark:border-gray-800">
                        <div class="text-[10px] text-gray-500 mb-1">本益比 (PER)</div>
                        <div class="text-xl font-bold ${per !== '--' ? 'text-blue-500' : 'text-gray-400'}">${per}x</div>
                    </div>
                    <div class="bg-gray-50 dark:bg-gray-900 p-4 rounded-xl border border-gray-100 dark:border-gray-800">
                        <div class="text-[10px] text-gray-500 mb-1">每股盈餘 (EPS)</div>
                        <div class="text-xl font-bold">${this.formatValue(latest.eps)}</div>
                        <div class="text-[10px] ${latest.yoy >= 0 ? 'text-red-500' : 'text-green-500'}">YoY ${latest.yoy != null ? `${latest.yoy}%` : '--'}</div>
                    </div>
                    <div class="bg-gray-50 dark:bg-gray-900 p-4 rounded-xl border border-gray-100 dark:border-gray-800">
                        <div class="text-[10px] text-gray-500 mb-1">ROE</div>
                        <div class="text-xl font-bold text-orange-500">${latest.roe != null ? `${latest.roe}%` : '--'}</div>
                    </div>
                    <div class="bg-gray-50 dark:bg-gray-900 p-4 rounded-xl border border-gray-100 dark:border-gray-800">
                        <div class="text-[10px] text-gray-500 mb-1">毛利率</div>
                        <div class="text-xl font-bold text-green-500">${latest.gm != null ? `${latest.gm}%` : '--'}</div>
                    </div>
                </div>

                ${fairValue?.status === 'ok' && fairValue.fair_value != null ? `
                <div class="bg-orange-50 dark:bg-orange-950/20 rounded-2xl border border-orange-200 dark:border-orange-800/40 p-5">
                    <div class="flex items-center justify-between gap-3 mb-4">
                        <div>
                            <h4 class="text-sm font-bold text-orange-700 dark:text-orange-300">自有公允價（${this.escapeHtml(this.currentSymbol)} ${this.escapeHtml(stockInfo?.name || fairValue.name || '')}）</h4>
                            <p class="text-[10px] text-gray-500 mt-1">${this.escapeHtml(fairValueMethodLabels[fairValue.model] || fairValue.model || '公開資料估值')}；以公開財報與市場資料計算</p>
                        </div>
                        <span class="text-[10px] px-2 py-1 rounded-full bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300">${this.escapeHtml(fairValue.confidence || '--')}</span>
                    </div>
                    <div class="grid grid-cols-2 md:grid-cols-6 gap-3">
                        ${[
                            ['基準公允價', fairValue.fair_value, 'text-orange-600'],
                            ['現價', fairValue.market_price, 'text-gray-900 dark:text-white'],
                            ['上行空間', fairValue.upside != null ? `${(fairValue.upside * 100).toFixed(1)}%` : '--', fairValue.upside >= 0 ? 'text-red-500' : 'text-green-500'],
                            ['悲觀', fairValue.range?.bear, 'text-gray-700 dark:text-gray-300'],
                            ['基準', fairValue.range?.base, 'text-gray-700 dark:text-gray-300'],
                            ['樂觀', fairValue.range?.bull, 'text-gray-700 dark:text-gray-300']
                        ].map(([label, value, cls]) => `
                            <div class="bg-white/70 dark:bg-gray-900/50 rounded-xl p-3 border border-orange-100 dark:border-orange-900/30">
                                <div class="text-[10px] text-gray-500 mb-1">${label}</div>
                                <div class="text-lg font-bold font-mono ${cls}">${typeof value === 'number' ? value.toFixed(1) : (value || '--')}</div>
                            </div>`).join('')}
                    </div>
                    <div class="mt-3 text-[10px] text-gray-500">
                        財報：${this.escapeHtml(fairValue.source_dates?.financials || '--')} · 價格：${this.escapeHtml(fairValue.source_dates?.price || '--')} · 模型結果不代表保證價格
                    </div>
                </div>` : `
                <div class="bg-gray-50 dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5">
                    <h4 class="text-sm font-bold text-gray-600 dark:text-gray-300">自有公允價</h4>
                    <p class="text-xs text-gray-500 mt-2">${this.escapeHtml(fairValue?.missing_data?.length ? `資料不足：${fairValue.missing_data.join('、')}` : (fairValue?.warnings?.[fairValue.warnings.length - 1] || '資料不足，尚未產生公允價'))}</p>
                </div>`}

                ${quarterly?.data ? `
                <div class="overflow-x-auto bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
                    <table class="w-full text-xs text-left">
                        <thead class="bg-gray-50 dark:bg-gray-800 text-gray-500">
                            <tr>
                                <th class="px-4 py-3">季度</th>
                                <th class="px-4 py-3 text-right">EPS</th>
                                <th class="px-4 py-3 text-right">毛利率</th>
                                <th class="px-4 py-3 text-right">營益率</th>
                                <th class="px-4 py-3 text-right">淨利率</th>
                                <th class="px-4 py-3 text-right">ROE</th>
                                <th class="px-4 py-3 text-right">ROA</th>
                                <th class="px-4 py-3 text-right">YoY</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
                            ${sorted.slice(0, 8).map(item => `
                            <tr>
                                <td class="px-4 py-3 font-medium">${item.period}</td>
                                <td class="px-4 py-3 text-right font-bold">${this.formatValue(item.eps)}</td>
                                <td class="px-4 py-3 text-right">${item.gm != null ? item.gm + '%' : '--'}</td>
                                <td class="px-4 py-3 text-right">${item.om != null ? item.om + '%' : '--'}</td>
                                <td class="px-4 py-3 text-right">${item.nm != null ? item.nm + '%' : '--'}</td>
                                <td class="px-4 py-3 text-right text-orange-500">${item.roe != null ? item.roe + '%' : '--'}</td>
                                <td class="px-4 py-3 text-right">${item.roa != null ? item.roa + '%' : '--'}</td>
                                <td class="px-4 py-3 text-right ${item.yoy >= 0 ? 'text-red-500' : 'text-green-500'}">${item.yoy != null ? item.yoy + '%' : '--'}</td>
                            </tr>`).join('')}
                        </tbody>
                    </table>
                </div>` : '<div class="p-8 text-center text-gray-500">暫無財務數據</div>'}

                ${etfHoldings.length > 0 ? `
                <div class="bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/10 dark:to-indigo-900/10 rounded-2xl border border-purple-200 dark:border-purple-800/30 p-5">
                    <h4 class="text-sm font-bold text-purple-700 dark:text-purple-400 mb-3 flex items-center">
                        <svg class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
                        ETF 曝險度
                    </h4>
                    <div class="grid grid-cols-2 gap-3 mb-3">
                        <div class="bg-white/60 dark:bg-gray-800/40 rounded-xl p-3 text-center">
                            <div class="text-2xl font-bold text-purple-600 dark:text-purple-400">${etfHoldings.length}</div>
                            <div class="text-[10px] text-gray-500">持有 ETF 檔數</div>
                        </div>
                        <div class="bg-white/60 dark:bg-gray-800/40 rounded-xl p-3 text-center">
                            <div class="text-2xl font-bold text-indigo-600 dark:text-indigo-400">${etfTotalWeight.toFixed(2)}%</div>
                            <div class="text-[10px] text-gray-500">合計被動權重</div>
                        </div>
                    </div>
                    <div class="space-y-1.5">
                        ${etfHoldings.slice(0, 5).map(h => `
                        <div class="flex items-center justify-between bg-white/40 dark:bg-gray-800/30 rounded-lg px-3 py-2">
                            <div class="flex items-center space-x-2">
                                <span class="text-xs font-mono font-bold text-purple-600 dark:text-purple-400">${h.id}</span>
                                <span class="text-xs text-gray-600 dark:text-gray-300">${h.name}</span>
                            </div>
                            <span class="text-xs font-bold">${h.weight.toFixed(2)}%</span>
                        </div>`).join('')}
                        ${etfHoldings.length > 5 ? `<div class="text-center text-[10px] text-gray-400 pt-1">...及其他 ${etfHoldings.length - 5} 檔 ETF</div>` : ''}
                    </div>
                </div>` : ''}

                <div class="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5">
                    <h4 class="text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 flex items-center">
                        <svg class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                        業務摘要
                    </h4>
                    <p class="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                        本股屬於 <span class="font-bold text-blue-600 dark:text-blue-400">${sector}</span> 產業，
                        主要業務涵蓋 <span class="font-bold text-blue-600 dark:text-blue-400">${subIndustry}</span> 相關領域。
                        ${classification.themes.length > 0 ? `近期市場關注題材包括 ${classification.themes.map(t => `<span class="font-medium text-orange-500">${this.escapeHtml(t)}</span>`).join('、')}。` : ''}
                    </p>
                </div>
            </div>`;
    },

    renderETFComposition(container, etfData, rebalance = null, rebalanceAvailable = false, stocksMeta = null) {
        const holdings = [...etfData.holdings].sort((a, b) => b.weight - a.weight);
        const top10 = holdings.slice(0, 10);
        const others = holdings.slice(10);
        const othersWeight = others.reduce((s, h) => s + (h.weight || 0), 0);
        const stockName = stockId => {
            const holding = holdings.find(item => (item.stock_id || '') === stockId);
            const meta = stocksMeta?.stocks?.find(item => item.symbol === stockId);
            return holding?.stock_name || holding?.name || meta?.name || stockId;
        };
        const movementItems = (items, colorClass, formatter) => (items || []).slice(0, 4).map(item => {
            const symbol = item.stock_id || item;
            const value = formatter
                ? '<span class="font-mono font-bold ' + colorClass + ' shrink-0">' + formatter(item) + '</span>'
                : '';
            return '<div class="flex items-center justify-between gap-2 text-xs">' +
                '<span class="truncate"><span class="font-mono font-bold">' + this.escapeHtml(symbol) + '</span> ' +
                this.escapeHtml(stockName(symbol)) + '</span>' + value + '</div>';
        }).join('');
        const movementGroup = (title, items, colorClass, formatter = null) => {
            if (!items?.length) return '';
            const extra = items.length > 4
                ? '<div class="text-[10px] text-gray-400">另有 ' + (items.length - 4) + ' 檔</div>'
                : '';
            return '<div class="space-y-1.5">' +
                '<div class="text-xs font-bold ' + colorClass + '">' + title + ' ' + items.length + '</div>' +
                movementItems(items, colorClass, formatter) + extra + '</div>';
        };
        const rebalanceHasChanges = rebalance && ['added', 'removed', 'weight_up', 'weight_down']
            .some(key => rebalance[key]?.length);
        const rebalancePanel = rebalanceAvailable
            ? '<div class="bg-gradient-to-r from-orange-50 to-rose-50 dark:from-orange-900/10 dark:to-rose-900/10 rounded-2xl border border-orange-200 dark:border-orange-800/30 p-5">' +
                '<h4 class="text-sm font-bold text-orange-700 dark:text-orange-400 mb-3 flex items-center">' +
                    '<span class="mr-1.5">🔄</span> 今日換股動向' +
                    '<span class="ml-2 text-[10px] text-gray-500 font-normal">最新交易日異動</span>' +
                '</h4>' +
                (rebalanceHasChanges
                    ? '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">' +
                        movementGroup('新進', rebalance.added, 'text-red-500') +
                        movementGroup('剔除', rebalance.removed, 'text-green-500') +
                        movementGroup('權重增加', rebalance.weight_up, 'text-red-500', item => '+' + Number(item.diff || 0).toFixed(2) + '%') +
                        movementGroup('權重減少', rebalance.weight_down, 'text-green-500', item => Number(item.diff || 0).toFixed(2) + '%') +
                    '</div>'
                    : '<div class="text-sm text-gray-500">今日未偵測到明顯換股異動</div>') +
            '</div>'
            : '';

        container.innerHTML = `
            <div class="p-4 space-y-4 flex-1 overflow-y-auto no-scrollbar pb-12">
                <div class="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5">
                    <h3 class="text-lg font-bold">${etfData.name}</h3>
                    <div class="flex items-center space-x-3 mt-2">
                        <span class="text-[10px] px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 font-bold">${etfData.category || '--'}</span>
                        <span class="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500">${etfData.data_mode === 'full_holdings' ? '完整揭露' : '前幾大持股'}</span>
                    </div>
                </div>

                ${rebalancePanel}

                <div id="etf-pie-chart" class="w-full h-64 bg-white dark:bg-gray-900 rounded-2xl border p-2"></div>

                <div class="overflow-x-auto bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
                    <table class="w-full text-xs text-left">
                        <thead class="bg-gray-50 dark:bg-gray-800 text-gray-500">
                            <tr>
                                <th class="px-4 py-3">#</th>
                                <th class="px-4 py-3">代碼</th>
                                <th class="px-4 py-3">名稱</th>
                                <th class="px-4 py-3 text-right">權重</th>
                                <th class="px-4 py-3">佔比</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
                            ${holdings.map((h, i) => `
                            <tr class="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                <td class="px-4 py-3 text-gray-400">${i + 1}</td>
                                <td class="px-4 py-3 font-bold font-mono">${h.stock_id}</td>
                                <td class="px-4 py-3">${h.stock_name}</td>
                                <td class="px-4 py-3 text-right font-bold">${h.weight.toFixed(2)}%</td>
                                <td class="px-4 py-3">
                                    <div class="w-24 bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                                        <div class="bg-blue-500 rounded-full h-1.5" style="width: ${Math.min(h.weight * 3, 100)}%"></div>
                                    </div>
                                </td>
                            </tr>`).join('')}
                        </tbody>
                    </table>
                </div>
            </div>`;

        setTimeout(() => {
            const chartDom = document.getElementById('etf-pie-chart');
            if (!chartDom) return;
            const chart = echarts.init(chartDom, document.documentElement.classList.contains('dark') ? 'dark' : null);
            const pieData = top10.map(h => {
                const code = h.stock_id || h.symbol || '';
                const displayName = h.stock_name || h.name || code;
                return { name: code ? `${code} ${displayName}` : displayName, value: h.weight };
            });
            if (othersWeight > 0) pieData.push({ name: '其他', value: othersWeight });
            chart.setOption({
                backgroundColor: 'transparent',
                tooltip: { trigger: 'item', formatter: '{b}: {c}%' },
                series: [{ type: 'pie', radius: ['30%', '60%'], center: ['50%', '50%'], data: pieData, label: { fontSize: 10, formatter: '{b}\n{d}%' }, itemStyle: { borderRadius: 4 } }]
            });
            window.addEventListener('resize', () => chart.resize());
        }, 100);
    },

    escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },

    formatValue(val, decimals = 2) {
        if (val === undefined || val === null || isNaN(val)) return '--';
        return new Intl.NumberFormat('zh-TW', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(val);
    },

    showEditModal(trade, id, container) {
        const qty = trade.quantity || trade.shares || 0;
        const price = trade.price || 0;
        const fee = trade.fee || 0;
        const tax = trade.tax || 0;

        // Create modal overlay
        const modal = document.createElement('div');
        modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px)';
        modal.innerHTML = `
            <div class="bg-white dark:bg-[#161b22] rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xl w-full max-w-sm mx-4 overflow-hidden">
                <div class="p-5 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50">
                    <h3 class="font-bold text-gray-900 dark:text-white text-sm">✏️ 編輯交易</h3>
                </div>
                <div class="p-5 space-y-4">
                    <div>
                        <label class="text-xs font-bold text-gray-500 dark:text-gray-400 block mb-1">股數</label>
                        <input type="number" id="edit-qty" value="${qty}" class="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-3 outline-none focus:border-blue-500 transition-colors text-sm text-gray-900 dark:text-white">
                    </div>
                    <div>
                        <label class="text-xs font-bold text-gray-500 dark:text-gray-400 block mb-1">成交價格</label>
                        <input type="number" id="edit-price" value="${price}" step="0.01" class="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-3 outline-none focus:border-blue-500 transition-colors text-sm text-gray-900 dark:text-white">
                    </div>
                    <div>
                        <label class="text-xs font-bold text-gray-500 dark:text-gray-400 block mb-1">手續費</label>
                        <input type="number" id="edit-fee" value="${fee}" step="0.01" class="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-3 outline-none focus:border-blue-500 transition-colors text-sm text-gray-900 dark:text-white">
                    </div>
                    <div>
                        <label class="text-xs font-bold text-gray-500 dark:text-gray-400 block mb-1">交易稅</label>
                        <input type="number" id="edit-tax" value="${tax}" step="0.01" class="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-3 outline-none focus:border-blue-500 transition-colors text-sm text-gray-900 dark:text-white">
                    </div>
                    <div class="flex space-x-3 pt-2">
                        <button id="edit-cancel" class="flex-1 py-3 text-sm font-bold rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">取消</button>
                        <button id="edit-save" class="flex-1 py-3 text-sm font-bold rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors">儲存</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const focusInput = modal.querySelector('#edit-qty');
        setTimeout(() => focusInput.focus(), 100);

        modal.querySelector('#edit-cancel').addEventListener('click', () => modal.remove());

        modal.querySelector('#edit-save').addEventListener('click', async () => {
            const newQty = Number(modal.querySelector('#edit-qty').value);
            const newPrice = Number(modal.querySelector('#edit-price').value);
            const newFee = Number(modal.querySelector('#edit-fee').value);
            const newTax = Number(modal.querySelector('#edit-tax').value);

            if (!newQty || newQty <= 0) { alert('請輸入有效的股數'); return; }
            if (!newPrice || newPrice <= 0) { alert('請輸入有效的價格'); return; }

            const updated = { ...trade, quantity: newQty, shares: newQty, price: newPrice, fee: newFee, tax: newTax };
            await db.updateTrade(id, updated);
            modal.remove();
            if (typeof window.init === 'function') window.init();
            this.renderTradesTab(container);
        });

        // Close on backdrop click
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
    }
};

window.StockDetail = StockDetail;
