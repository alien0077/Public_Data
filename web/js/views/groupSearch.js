import { api } from '../api.js';
import { getPriceChangeStyle } from '../utils/priceStyle.js';
import { stockIdentityHTML, stockMetricHTML, stockMobileCardHTML, fairValueHTML } from '../utils/stockListLayout.js';
import { canonicalGroupName, cleanGroupName } from '../utils/groupTaxonomy.js';

export const GroupSearch = {
    _groupIndex: {},
    _allStocks: [],
    _stockBySymbol: {},
    _loaded: false,
    _pendingQuery: '',
    _peMap: null,

    async init() {
        const container = document.getElementById('view-groupSearch');
        if (!container) return;

        container.innerHTML = `
            <div class="p-4 md:p-6 max-w-5xl mx-auto w-full flex flex-col min-h-full">
                <div class="relative mb-4">
                    <span class="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 text-lg">🔎</span>
                    <input type="text" id="gs-input"
                        class="w-full pl-12 pr-4 py-3 bg-white dark:bg-[#161b22] border border-gray-200 dark:border-gray-800 rounded-xl text-gray-900 dark:text-white text-base outline-none focus:border-blue-500 transition-colors"
                        placeholder="搜尋族群 (例: CPO、載板、AI、半導體)">
                    <button id="gs-clear" class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-900 dark:hover:text-white text-lg hidden" onclick="GroupSearch.clear()">✕</button>
                </div>
                <div id="gs-status" class="text-center text-gray-500 py-8">
                    <div class="inline-block w-5 h-5 border-2 border-gray-300 dark:border-gray-600 border-t-blue-500 rounded-full animate-spin mr-2 align-middle"></div>
                    載入股票資料中...
                </div>
                <div id="gs-results" class="space-y-3 pb-10"></div>
            </div>
        `;

        if (!this._loaded) await this._loadData();

        const input = document.getElementById('gs-input');
        if (input) {
            input.addEventListener('input', () => this._onSearch());
            if (this._pendingQuery) {
                input.value = this._pendingQuery;
                this._pendingQuery = '';
            }
            input.focus();
        }

        const uniqueCount = new Set(Object.values(this._groupIndex).flat()).size;
        document.getElementById('gs-status').innerHTML = '📂 ' + Object.keys(this._groupIndex).length + ' 個族群 · 📈 ' + uniqueCount + ' 檔股票';
        await this._onSearch();
    },

    async openGroup(groupName) {
        const query = canonicalGroupName(groupName);
        if (!query) return;
        this._pendingQuery = query;
        document.getElementById('stock-detail')?.classList.add('hidden');

        if (window.router?.currentPrimary !== 'groupSearch') {
            window.router?.switchPage('groupSearch');
        } else {
            await this.init();
        }
    },

    async _loadData() {
        try {
            const json = await api.getStocksMeta();
            const stocks = json.stocks || json.data || [];
            this._allStocks = stocks;
            this._stockBySymbol = {};

            const idx = {};
            for (const s of stocks) {
                const symbol = this.normalizeStockSymbol(s.symbol);
                if (!symbol) continue;
                this._stockBySymbol[symbol] = s;

                const groups = new Set();
                if (s.macro_sector) groups.add(s.macro_sector);
                if (s.primary_theme) groups.add(s.primary_theme);
                if (s.official_sector) groups.add(s.official_sector);
                if (s.sub_industry) groups.add(s.sub_industry);
                if (s.power_chain_role) groups.add(s.power_chain_role);
                if (Array.isArray(s.themes)) s.themes.forEach(t => groups.add(t));

                groups.forEach(g => {
                    const name = canonicalGroupName(g);
                    if (!name) return;
                    if (!idx[name]) idx[name] = [];
                    if (!idx[name].includes(symbol)) idx[name].push(symbol);
                });
            }
            this._groupIndex = idx;
            this._loaded = true;
        } catch (e) {
            document.getElementById('gs-status').innerHTML = '<span class="text-red-500">❌ 載入失敗：' + this._esc(e.message) + '</span>';
        }
    },

    async _onSearch() {
        const input = document.getElementById('gs-input');
        const clearBtn = document.getElementById('gs-clear');
        const resultsEl = document.getElementById('gs-results');
        if (!input || !resultsEl) return;

        const q = input.value.trim();
        if (clearBtn) clearBtn.style.display = q.length > 0 ? 'block' : 'none';

        if (!q) {
            resultsEl.innerHTML = '<div class="text-center text-gray-500 py-16"><div class="text-5xl mb-4">🔍</div><p>輸入族群名稱開始搜尋</p><p class="text-sm mt-2 text-gray-600">例如：CPO、載板、AI、半導體、散熱</p></div>';
            return;
        }

        const names = this._findGroupNames(q);
        if (names.length === 0) {
            resultsEl.innerHTML = '<div class="text-center text-gray-500 py-16"><div class="text-5xl mb-4">🔎</div><p>沒有找到符合「' + this._esc(q) + '」的族群</p></div>';
            return;
        }

        const exact = names.length === 1 && (
            names[0].toLowerCase() === q.toLowerCase() ||
            names[0].toLowerCase() === canonicalGroupName(q).toLowerCase()
        );
        resultsEl.innerHTML = '<div class="text-center text-gray-500 py-10"><div class="inline-block w-5 h-5 border-2 border-gray-300 dark:border-gray-600 border-t-blue-500 rounded-full animate-spin mr-2 align-middle"></div>整理個股清單...</div>';
        resultsEl.innerHTML = await this._renderGroups(names, exact);
    },

    _findGroupNames(q) {
        const synonyms = {
            'cpo': '矽光子_CPO', '光收發': '矽光子_CPO', '矽光子': '矽光子_CPO',
            'CPO_Optical': '矽光子_CPO', 'Silicon_Photonics': '矽光子_CPO',
            '載板': 'PCB_CCL_ABF', 'abf': 'PCB_CCL_ABF', 'ic載板': 'PCB_CCL_ABF',
            'pcb': 'PCB_CCL_ABF', 'ccl': 'PCB_CCL_ABF',
            '鑽孔': 'PCB_CCL_Drilling',
            '網通': '網通光通', '光通': 'Fiber_Optic',
            '散熱': 'Cooling_Module',
            '重電': 'Heavy_Electrical',
            '綠能': 'Green_Energy',
            '軍工': 'Defense',
            '生技': 'Biotechnology',
            '航運': 'Shipping',
            'financials': '金融保險業', '金融': '金融保險業',
            '建設': '建材營造業', '營建': '建材營造業',
            'materials': '原物料大板塊', '原物料': '原物料大板塊',
            'semiconductor': '半導體業', 'technology': '科技大板塊',
            '低軌': '低軌衛星_SpaceX鏈', '衛星': '低軌衛星_SpaceX鏈',
            'mosfet': '上游IC設計',
            '二極體': '中游製造與IDM',
            '導線架': '下游封測與材料',
        };

        const query = q.toLowerCase();
        const synonymTargets = Object.keys(synonyms)
            .filter(k => k.toLowerCase().includes(query))
            .map(k => canonicalGroupName(synonyms[k]));

        return Object.keys(this._groupIndex).filter(name => {
            if (name.toLowerCase().includes(query)) return true;
            return synonymTargets.some(t => name.toLowerCase().includes(t.toLowerCase()));
        }).sort((a, b) => {
            const ae = a.toLowerCase() === query ? -1 : 0;
            const be = b.toLowerCase() === query ? -1 : 0;
            if (ae !== be) return ae - be;
            return a.localeCompare(b, 'zh-Hant');
        }).slice(0, 30);
    },

    async _renderGroups(names, exact) {
        let html = '<div class="text-xs text-gray-500 font-semibold uppercase tracking-wider px-1 mb-3">📊 找到 ' + names.length + ' 個族群</div>';
        for (const name of names) {
            const symbols = this._groupIndex[name] || [];
            const limit = exact ? 120 : 50;
            const visibleSymbols = symbols.slice(0, limit);
            const rowsHTML = await this._renderStockList(visibleSymbols);
            const openClass = exact ? ' open' : ' hidden';
            const displayStyle = exact ? ' style="display:block"' : '';
            const arrowStyle = exact ? ' style="transform:rotate(90deg)"' : '';
            html += `
                <div class="bg-white dark:bg-[#161b22] border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden mb-2">
                    <div class="gs-group-header flex items-center justify-between px-4 py-3.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-[#1c2333] transition-colors" onclick="GroupSearch._toggle(this)">
                        <div>
                            <span class="text-[15px] font-semibold text-gray-900 dark:text-white">${this._esc(name)}</span>
                            <span class="text-xs text-gray-500 bg-gray-100 dark:bg-[#1c2333] px-2.5 py-0.5 rounded-full ml-2">${symbols.length} 檔</span>
                        </div>
                        <span class="gs-arrow text-gray-500 text-xs transition-transform"${arrowStyle}>▸</span>
                    </div>
                    <div class="gs-stocks${openClass} border-t border-gray-200 dark:border-gray-800"${displayStyle}>
                        ${rowsHTML}
                        ${symbols.length > limit ? `<div class="px-4 py-2.5 text-sm text-gray-500">... 尚有 ${symbols.length - limit} 檔，請縮小分類或搜尋關鍵字</div>` : ''}
                    </div>
                </div>`;
        }
        return html;
    },

    async _renderStockList(symbols) {
        const [quotes, peMap, fairValueMap] = await Promise.all([
            api.fetchQuotes(symbols).catch(() => ({})),
            this._getPeMap(),
            api.fetchFairValueMap().catch(() => ({}))
        ]);

        const items = symbols.map(sym => this._buildStockItem(sym, quotes, peMap, fairValueMap))
            .sort((a, b) => b.changePercent - a.changePercent);

        const desktopRows = items.map(item => `
            <tr class="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors cursor-pointer" onclick="window.StockDetail.show(decodeURIComponent('${encodeURIComponent(item.symbol)}'))">
                <td class="px-3 md:px-5 py-3">${stockIdentityHTML(item.symbol, item.name)}</td>
                <td class="px-3 md:px-5 py-3 text-right ${item.priceClass}">${item.price > 0 ? this.formatNumber(item.price) : '--'}</td>
                <td class="px-3 md:px-5 py-3 text-right ${item.priceClass} text-xs font-bold">${item.price > 0 ? item.changeText : '--'}</td>
                <td class="px-3 md:px-5 py-3 text-right font-bold ${item.peColor}">${item.peText}</td>
                <td class="px-3 md:px-5 py-3 text-right">${fairValueHTML(item.fairValue)}</td>
                <td class="px-3 md:px-5 py-3 text-right text-xs text-gray-500">明細 ↗</td>
            </tr>
        `).join('');

        const mobileCards = items.map(item => stockMobileCardHTML({
            symbol: item.symbol,
            name: item.name,
            primaryHTML: `<div class="${item.priceClass}"><div class="font-bold">${item.price > 0 ? this.formatNumber(item.price) : '--'}</div><div class="text-[10px]">${item.price > 0 ? item.changeText : '--'}</div></div>`,
            metricsHTML: stockMetricHTML('本益比', item.peText, { valueClass: item.peColor }) +
                stockMetricHTML('分類', item.primaryTheme || '--') +
                stockMetricHTML('市場', item.market || '--'),
            valuation: item.fairValue,
            onClick: `window.StockDetail.show(decodeURIComponent('${encodeURIComponent(item.symbol)}'))`
        })).join('');

        return `
            <div class="hidden md:block overflow-x-auto">
                <table class="w-full text-sm stock-list-table">
                    <thead class="text-xs text-gray-500 bg-gray-50 dark:bg-gray-900/60">
                        <tr>
                            <th class="px-3 md:px-5 py-2 text-left">股票</th>
                            <th class="px-3 md:px-5 py-2 text-right">股價</th>
                            <th class="px-3 md:px-5 py-2 text-right">漲跌幅</th>
                            <th class="px-3 md:px-5 py-2 text-right">PE</th>
                            <th class="px-3 md:px-5 py-2 text-right">公允價</th>
                            <th class="px-3 md:px-5 py-2 text-right">操作</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-100 dark:divide-gray-800">${desktopRows}</tbody>
                </table>
            </div>
            <div class="md:hidden divide-y divide-gray-100 dark:divide-gray-800">${mobileCards}</div>
        `;
    },

    _buildStockItem(sym, quotes, peMap, fairValueMap = {}) {
        const symbol = this.normalizeStockSymbol(sym);
        const stock = this._stockBySymbol[symbol] || {};
        const quote = quotes[sym] || quotes[symbol] || {};
        const price = parseFloat(quote.price || 0);
        const refPrice = parseFloat(quote.referencePrice || price || 0);
        const changePercent = price > 0 && refPrice > 0 ? ((price - refPrice) / refPrice * 100) : 0;
        const style = getPriceChangeStyle(price, refPrice, symbol);
        const priceClass = style.bgClass ? `${style.textClass} ${style.bgClass}` : style.textClass;
        const peRatio = peMap[symbol];
        const peColor = peRatio < 15 ? 'text-green-500' : peRatio < 25 ? 'text-gray-600 dark:text-gray-300' : 'text-orange-500';
        return {
            symbol,
            name: stock.name || quote.name || symbol,
            market: stock.market || '',
            primaryTheme: canonicalGroupName(stock.primary_theme || stock.sub_industry || ''),
            price,
            refPrice,
            changePercent,
            changeText: `${changePercent > 0 ? '▲' : (changePercent < 0 ? '▼' : '')} ${Math.abs(changePercent).toFixed(2)}%`,
            priceClass,
            peText: peRatio ? peRatio.toFixed(1) : '--',
            peColor,
            fairValue: fairValueMap[symbol]
        };
    },

    async _getPeMap() {
        if (this._peMap) return this._peMap;
        const peMap = {};
        const [sectorPe, peAll] = await Promise.all([
            api.fetchSectorPE().catch(() => null),
            api.fetchLocalJson('quant/pe_ratio.json').catch(() => null)
        ]);
        if (sectorPe?.sectors) {
            sectorPe.sectors.forEach(sector => {
                (sector.stocks || []).forEach(s => { peMap[this.normalizeStockSymbol(s.stock_id)] = s.pe_ratio; });
            });
        }
        if (peAll?.stocks) {
            Object.entries(peAll.stocks).forEach(([sid, info]) => {
                const cleanSid = this.normalizeStockSymbol(sid);
                if (peMap[cleanSid] == null && info.pe) peMap[cleanSid] = info.pe;
            });
        }
        this._peMap = peMap;
        return peMap;
    },

    _toggle(header) {
        const stocks = header.nextElementSibling;
        const arrow = header.querySelector('.gs-arrow');
        const isOpen = stocks.classList.contains('open');
        stocks.classList.toggle('open', !isOpen);
        stocks.style.display = isOpen ? 'none' : 'block';
        arrow.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(90deg)';
    },

    clear() {
        const input = document.getElementById('gs-input');
        if (input) { input.value = ''; this._onSearch(); input.focus(); }
    },

    normalizeStockSymbol(symbol = '') {
        return String(symbol || '').replace(/^\^/, '').split('.')[0].toUpperCase();
    },

    cleanGroupName(value) {
        return cleanGroupName(value);
    },

    canonicalGroupName(value) {
        return canonicalGroupName(value);
    },

    formatNumber(num, decimals = 2) {
        return new Intl.NumberFormat('zh-TW', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        }).format(num);
    },

    _esc(s) {
        const d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    }
};

window.GroupSearch = GroupSearch;
