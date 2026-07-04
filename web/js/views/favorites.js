import { api } from '../api.js';
import { getPriceChangeStyle } from '../utils/priceStyle.js';
import { stockIdentityHTML, stockMetricHTML, stockMobileCardHTML } from '../utils/stockListLayout.js';

/**
 * Favorites View
 * 管理 5 個自訂收藏類別，儲存於 localStorage
 */
export const Favorites = {
    _categories: ['我的最愛', '觀察中', '定存股', '潛力股', '投機短線'],
    _data: {}, // { "類別名稱": ["2330", "0050"] }
    _activeTab: 0,
    _intervalId: null,
    
    init(secondaryTab = null) {
        this.loadData();
        
        // 如果傳入的 secondaryTab 對應某個分類名稱，則切換過去
        if (secondaryTab && this._categories.includes(secondaryTab)) {
            this._activeTab = this._categories.indexOf(secondaryTab);
        } else if (secondaryTab === '我的收藏') {
            // 從 TrendHunter 的二級導航點擊過來，預設保留當前 activeTab
        }

        const viewContainer = document.getElementById('view-favorites');
        if (!viewContainer) return;

        this.renderStructure(viewContainer);
        this.renderContent();
        this.startAutoRefresh();
    },

    loadData() {
        try {
            const savedCategories = localStorage.getItem('twstock_favorite_categories');
            if (savedCategories) {
                this._categories = JSON.parse(savedCategories);
                // 確保剛好有 5 個
                while(this._categories.length < 5) this._categories.push('新分類');
                this._categories = this._categories.slice(0, 5);
            }
            
            const savedData = localStorage.getItem('twstock_favorite_data');
            if (savedData) {
                this._data = JSON.parse(savedData);
            } else {
                this._categories.forEach(c => this._data[c] = []);
            }
        } catch (e) {
            console.error("Failed to load favorites", e);
            this._categories.forEach(c => this._data[c] = []);
        }
    },

    saveData() {
        localStorage.setItem('twstock_favorite_categories', JSON.stringify(this._categories));
        localStorage.setItem('twstock_favorite_data', JSON.stringify(this._data));
    },

    normalizeStockSymbol(symbol = '') {
        return String(symbol || '').replace(/^\^/, '').split('.')[0].toUpperCase();
    },

    isPlaceholderName(name, symbol) {
        const normalizedName = String(name || '').trim().toUpperCase();
        const baseSymbol = this.normalizeStockSymbol(symbol);
        if (!normalizedName) return true;
        return normalizedName === baseSymbol ||
            normalizedName === `${baseSymbol}.TW` ||
            normalizedName === `${baseSymbol}.TWO`;
    },

    resolveDisplayName(symbol, quote = {}, meta = {}) {
        const baseSymbol = this.normalizeStockSymbol(symbol);
        const metaStock = meta.stocks?.find(s => this.normalizeStockSymbol(s.symbol) === baseSymbol);
        if (metaStock?.name) return metaStock.name;
        if (!this.isPlaceholderName(quote.name, symbol)) return quote.name;
        return baseSymbol || symbol;
    },

    // 供其他模組呼叫 (如 stockDetail.js)
    toggleFavorite(symbol) {
        let found = false;
        let removedFrom = '';
        
        // 如果已經在任何分類中，則移除
        for (let cat of this._categories) {
            if (this._data[cat] && this._data[cat].includes(symbol)) {
                this._data[cat] = this._data[cat].filter(s => s !== symbol);
                found = true;
                removedFrom = cat;
            }
        }

        if (found) {
            this.saveData();
            return { action: 'removed', category: removedFrom };
        } else {
            // 否則加入當前活躍的分類
            const cat = this._categories[this._activeTab] || this._categories[0];
            if (!this._data[cat]) this._data[cat] = [];
            this._data[cat].push(symbol);
            this.saveData();
            return { action: 'added', category: cat };
        }
    },

    isFavorite(symbol) {
        for (let cat of this._categories) {
            if (this._data[cat] && this._data[cat].includes(symbol)) return true;
        }
        return false;
    },

    renderStructure(container) {
        container.innerHTML = `
            <div class="flex flex-col space-y-6 h-full">
                <!-- Export/Import Buttons -->
                <div class="flex justify-between items-center">
                    <div class="text-sm text-gray-500">${this._categories[this._activeTab]} — ${(this._data[this._categories[this._activeTab]]||[]).length} 檔</div>
                    <div class="flex space-x-2">
                        <button class="px-3 py-1.5 text-xs font-medium rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors" onclick="Favorites.importWatchlist()">📥 匯入</button>
                        <button class="px-3 py-1.5 text-xs font-medium rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors" onclick="Favorites.exportWatchlist()">📤 匯出</button>
                        <button class="px-3 py-1.5 text-xs font-medium rounded-xl bg-red-50 dark:bg-red-900/20 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors" onclick="Favorites.clearAll()">🗑️ 清空全部</button>
                    </div>
                </div>
                <!-- Categories Tabs -->
                <div class="flex items-center space-x-2 md:space-x-4 overflow-x-auto no-scrollbar pb-2">
                    ${this._categories.map((cat, idx) => `
                        <button class="fav-tab group relative flex-shrink-0 px-4 py-2 text-sm font-medium rounded-xl transition-all duration-200 
                            ${idx === this._activeTab ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 hover:text-gray-900 dark:hover:text-white'}"
                            data-index="${idx}">
                            <span class="tab-name">${cat}</span>
                            <span class="edit-cat absolute -top-1 -right-1 bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 rounded-full w-5 h-5 flex items-center justify-center text-[10px] shadow-sm border border-gray-100 dark:border-gray-600 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity" title="修改名稱">✎</span>
                        </button>
                    `).join('')}
                </div>

                <!-- Search to Add -->
                <div id="fav-search-wrapper" class="relative">
                    <input type="text" id="fav-search-input" placeholder="🔍 輸入股票代號或名稱來加入收藏..."
                        class="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-3 pl-10 outline-none focus:border-blue-500 transition-colors text-sm text-gray-900 dark:text-white">
                </div>

                <!-- List Content -->
                <div class="bg-white dark:bg-[#161b22] rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm flex-1 flex flex-col transition-colors duration-300">
                    <div class="overflow-x-auto flex-1 hidden md:block">
                        <table class="w-full text-left">
                            <thead class="bg-gray-50/50 dark:bg-gray-900/50 text-gray-400 dark:text-gray-500 text-[10px] md:text-xs uppercase sticky top-0 z-10 backdrop-blur-sm">
                                <tr>
                                    <th class="px-3 md:px-6 py-4">代碼/名稱</th>
                                    <th class="px-3 md:px-6 py-4 text-right">現價</th>
                                    <th class="px-3 md:px-6 py-4 text-right">漲跌幅</th>
                                     <th class="px-3 md:px-6 py-4 text-right">最高</th>
                                     <th class="px-3 md:px-6 py-4 text-right">最低</th>
                                     <th class="px-3 md:px-6 py-4 text-right">本益比</th>
                                    <th class="px-3 md:px-6 py-4 text-right">操作</th>
                                </tr>
                            </thead>
                            <tbody id="favorites-body" class="divide-y divide-gray-100 dark:divide-gray-800 font-mono text-sm cursor-pointer">
                                <!-- Data will be injected here -->
                            </tbody>
                        </table>
                    </div>
                    <div id="favorites-cards" class="md:hidden divide-y divide-gray-100 dark:divide-gray-800"></div>
                </div>
            </div>
        `;

        // Bind events
        container.querySelectorAll('.fav-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                if (e.target.closest('.edit-cat')) return; // Ignore edit button clicks
                this._activeTab = parseInt(tab.dataset.index);
                this.renderStructure(container); // Re-render to update active state
                this.renderContent();
                this.refreshQuotes(); // Fetch quotes immediately on tab switch
            });
        });

        container.querySelectorAll('.edit-cat').forEach((btn, idx) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const newName = prompt('請輸入新的分類名稱：', this._categories[idx]);
                if (newName !== null && newName.trim() !== '') {
                    const oldName = this._categories[idx];
                    this._categories[idx] = newName.trim();
                    // Migrate data
                    if (this._data[oldName]) {
                        this._data[newName.trim()] = this._data[oldName];
                        delete this._data[oldName];
                    }
                    this.saveData();
                    this.renderStructure(container);
                    this.renderContent();
                }
            });
        });

        // Search autocomplete
        const searchInput = document.getElementById('fav-search-input');
        const searchWrapper = document.getElementById('fav-search-wrapper');
        if (searchInput && searchWrapper) {
            const dropdown = document.createElement('div');
            dropdown.className = 'autocomplete-dropdown';
            searchWrapper.appendChild(dropdown);

            let debounceTimer;
            searchInput.addEventListener('input', () => {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(async () => {
                    const q = searchInput.value.trim();
                    if (q.length < 1) { dropdown.innerHTML = ''; return; }
                    const meta = await api.getStocksMeta();
                    const stocks = meta.stocks || [];
                    const ql = q.toLowerCase();
                    const matches = stocks.filter(s =>
                        s.symbol.toLowerCase().includes(ql) || s.name.toLowerCase().includes(ql)
                    ).slice(0, 8);
                    if (matches.length === 0) { dropdown.innerHTML = ''; return; }
                    const cat = this._categories[this._activeTab];
                    const currentSymbols = new Set(this._data[cat] || []);
                    dropdown.innerHTML = matches.map(s => {
                        const exists = currentSymbols.has(s.symbol);
                        return `
                            <div class="autocomplete-item ${exists ? 'opacity-40' : ''}" data-symbol="${s.symbol}" data-name="${s.name}">
                                <span class="sym">${s.symbol}</span>
                                <span class="name">${s.name}</span>
                                <span class="action ${exists ? 'text-gray-500' : 'text-blue-400'}">${exists ? '✓ 已加入' : '+ 加入'}</span>
                            </div>
                        `;
                    }).join('');
                }, 150);
            });

            searchInput.addEventListener('blur', () => setTimeout(() => { dropdown.innerHTML = ''; }, 200));

            dropdown.addEventListener('mousedown', (e) => {
                const item = e.target.closest('.autocomplete-item');
                if (!item || item.dataset.symbol === undefined) return;
                e.preventDefault();
                const symbol = item.dataset.symbol;
                const cat = this._categories[this._activeTab];
                if (!this._data[cat]) this._data[cat] = [];
                if (this._data[cat].includes(symbol)) {
                    alert(`${symbol} 已在「${cat}」中`);
                    return;
                }
                this._data[cat].push(symbol);
                this.saveData();
                searchInput.value = '';
                dropdown.innerHTML = '';
                this.renderContent();
                this.refreshQuotes();
            });
        }
    },

    async renderContent(quotes = {}) {
        const body = document.getElementById('favorites-body');
        const cards = document.getElementById('favorites-cards');
        if (!body) return;

        const currentCat = this._categories[this._activeTab];
        const symbols = this._data[currentCat] || [];

        if (symbols.length === 0) {
            body.innerHTML = `
                <tr>
                    <td colspan="7" class="px-6 py-10 text-center text-gray-500">
                        這個分類還沒有收藏任何股票，請從其他畫面將股票加入收藏！
                    </td>
                </tr>
            `;
            if (cards) {
                cards.innerHTML = '<div class="px-4 py-10 text-center text-gray-500 text-sm">這個分類還沒有收藏任何股票，請從其他畫面將股票加入收藏！</div>';
            }
            return;
        }

        body.innerHTML = '';
        if (cards) cards.innerHTML = '';
        
        // 若有從 api.getStocksMeta() 取得的資料可以輔助名稱
        const meta = await api.getStocksMeta();
        const peData = await api.fetchSectorPE();
        const peMap = {};
        if (peData && peData.sectors) {
            peData.sectors.forEach(sector => {
                (sector.stocks || []).forEach(s => { peMap[this.normalizeStockSymbol(s.stock_id)] = s.pe_ratio; });
            });
        }
        const peAll = await api.fetchLocalJson('quant/pe_ratio.json');
        if (peAll && peAll.stocks) {
            Object.entries(peAll.stocks).forEach(([sid, info]) => {
                const cleanSid = this.normalizeStockSymbol(sid);
                if (peMap[cleanSid] == null && info.pe) { peMap[cleanSid] = info.pe; }
            });
        }

        symbols.forEach(sym => {
            const quote = quotes[sym] || {};
            const displaySymbol = this.normalizeStockSymbol(sym) || sym;
            const price = quote.price || 0;
            const refPrice = quote.referencePrice || price;
            const changePercent = (price > 0 && refPrice > 0) ? ((price - refPrice) / refPrice * 100) : 0;
            const high = quote.high || 0;
            const low = quote.low || 0;
            const name = this.resolveDisplayName(sym, quote, meta);

            const row = document.createElement('tr');
            row.className = 'hover:bg-gray-800/30 transition-colors';
            
            // 點擊整列顯示 K 線
            row.addEventListener('click', (e) => {
                if (e.target.closest('.remove-fav')) return; // 點擊刪除按鈕時不觸發
                window.StockDetail.show(sym);
            });

            const style = getPriceChangeStyle(price, refPrice, sym);
            const priceClass = style.bgClass ? `${style.textClass} ${style.bgClass}` : style.textClass;
            const peRatio = peMap[displaySymbol];
            const peColor = peRatio < 15 ? 'text-green-500' : peRatio < 25 ? 'text-gray-400' : 'text-orange-500';
            const peStr = peRatio ? peRatio.toFixed(1) : '--';
            
            row.innerHTML = `
                <td class="px-3 md:px-6 py-4">${stockIdentityHTML(displaySymbol, name)}</td>
                <td class="px-3 md:px-6 py-4 text-right ${priceClass}">
                    ${price > 0 ? this.formatNumber(price) : '--'}
                </td>
                <td class="px-3 md:px-6 py-4 text-right ${priceClass} text-xs font-bold">
                    ${price > 0 ? `${changePercent > 0 ? '▲' : (changePercent < 0 ? '▼' : '')} ${Math.abs(changePercent).toFixed(2)}%` : '--'}
                </td>
                 <td class="px-3 md:px-6 py-4 text-right text-gray-400 text-xs">
                     ${high > 0 ? this.formatNumber(high) : '--'}
                 </td>
                 <td class="px-3 md:px-6 py-4 text-right text-gray-400 text-xs">
                     ${low > 0 ? this.formatNumber(low) : '--'}
                 </td>
                 <td class="px-3 md:px-6 py-4 text-right font-bold ${peColor}">${peStr}</td>
                <td class="px-3 md:px-6 py-4 text-right">
                    <button class="remove-fav text-gray-500 hover:text-red-500 transition-colors" data-symbol="${sym}" title="移除收藏">
                        <svg class="w-5 h-5 inline-block" fill="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                    </button>
                </td>
            `;
            body.appendChild(row);

            if (cards) {
                const card = document.createElement('div');
                card.className = 'hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors';
                card.addEventListener('click', () => window.StockDetail.show(sym));
                card.innerHTML = stockMobileCardHTML({
                    symbol: displaySymbol,
                    name,
                    primaryHTML: `<div class="${priceClass}"><div class="font-bold">${price > 0 ? this.formatNumber(price) : '--'}</div><div class="text-[10px]">${price > 0 ? `${changePercent > 0 ? '▲' : (changePercent < 0 ? '▼' : '')} ${Math.abs(changePercent).toFixed(2)}%` : '--'}</div></div>`,
                    metricsHTML: stockMetricHTML('最高', high > 0 ? this.formatNumber(high) : '--') +
                        stockMetricHTML('最低', low > 0 ? this.formatNumber(low) : '--') +
                        stockMetricHTML('本益比', peStr, { valueClass: peColor }),
                    actionsHTML: `
                        <button class="remove-fav-mobile text-gray-500 hover:text-red-500 transition-colors" data-symbol="${sym}" title="移除收藏">
                            移除
                        </button>
                    `
                });
                cards.appendChild(card);
            }
        });

        // 綁定刪除按鈕
        document.querySelectorAll('.remove-fav, .remove-fav-mobile').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const sym = btn.dataset.symbol;
                if (confirm(`確定要將 ${sym} 移出此收藏分類嗎？`)) {
                    this._data[currentCat] = this._data[currentCat].filter(s => s !== sym);
                    this.saveData();
                    this.renderContent(quotes);
                }
            });
        });
    },

    async refreshQuotes() {
        const currentCat = this._categories[this._activeTab];
        const symbols = this._data[currentCat] || [];
        if (symbols.length === 0) return;

        try {
            const quotes = await api.fetchQuotes(symbols);
            this.renderContent(quotes);
        } catch (err) {
            console.error("Failed to refresh favorite quotes", err);
        }
    },

    clearAll() {
        if (!confirm('確定要清空所有收藏分類中的所有股票嗎？此操作無法復原！')) return;
        for (const cat of this._categories) {
            this._data[cat] = [];
        }
        this.saveData();
        const container = document.getElementById('view-favorites');
        if (container) { this.renderStructure(container); this.renderContent(); }
    },

    startAutoRefresh() {
        if (this._intervalId) clearInterval(this._intervalId);
        this.refreshQuotes();
        this._intervalId = setInterval(() => this.refreshQuotes(), 60000);
    },

    stopAutoRefresh() {
        if (this._intervalId) {
            clearInterval(this._intervalId);
            this._intervalId = null;
        }
    },

    formatNumber(num, decimals = 2) {
        return new Intl.NumberFormat('zh-TW', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        }).format(num);
    },

    getPriceColor(price, refPrice, sym) {
        const style = getPriceChangeStyle(price, refPrice, sym);
        return style.bgClass ? `${style.textClass} ${style.bgClass}` : style.textClass;
    },

    exportWatchlist() {
        const backup = { version: 1, categories: {} };
        for (const cat of this._categories) {
            backup.categories[cat] = (this._data[cat] || []).slice().sort();
        }
        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${new Date().toISOString().slice(0, 10)}_收藏.json`;
        a.click();
        URL.revokeObjectURL(url);
    },

    importWatchlist() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const data = JSON.parse(ev.target.result);
                    let importCats;
                    if (data.version === 1 && data.categories) {
                        importCats = data.categories;
                    } else if (data.categories) {
                        importCats = {};
                        for (const [key, syms] of Object.entries(data.categories)) {
                            const name = data.categoryNames?.[key] || key;
                            importCats[name] = syms;
                        }
                    }
                    if (!importCats) { alert('❌ 無法辨識的檔案格式'); return; }
                    const catNames = Object.keys(importCats);
                    const totalStocks = catNames.reduce((s, c) => s + (importCats[c] || []).length, 0);
                    if (!confirm(`將以匯入的分類 (${catNames.length} 個) 完全取代現有收藏，共 ${totalStocks} 檔股票。確定？`)) return;
                    this._categories = catNames;
                    this._data = {};
                    for (const [catName, symbols] of Object.entries(importCats)) {
                        if (Array.isArray(symbols)) {
                            this._data[catName] = [...symbols];
                        }
                    }
                    this.saveData();
                    const container = document.getElementById('view-favorites');
                    if (container) { this._activeTab = 0; this.renderStructure(container); this.renderContent(); }
                    alert(`✅ 匯入完成！共 ${totalStocks} 檔股票，${catNames.length} 個分類。`);
                } catch (err) {
                    alert(`❌ 匯入失敗：${err.message}`);
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }
};

// 暴露到 window 以便外部呼叫
window.Favorites = Favorites;
