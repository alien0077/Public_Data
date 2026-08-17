/**
 * API Module for TWStockTracker Web - Ultra Resilience Version (V4.1)
 */

const API_BASE = 'https://alienstocks.alien0077.workers.dev/api';

export const api = {
    getSecret() {
        return localStorage.getItem('twstock_secret');
    },

    _stocksMetaCache: null,
    _calendarCache: null,
    _ytdRefCache: null,
    _quantMetricsCache: null,
    _marginMaintenanceCache: null,
    _stockMetricsCache: null,

    async getStocksMeta() {
        if (!this._stocksMetaCache) {
            try { this._stocksMetaCache = await this.fetchLocalJson('meta/stocks.json'); }
            catch(e) { this._stocksMetaCache = { stocks: [] }; }
        }
        return this._stocksMetaCache;
    },

    async getCalendar() {
        if (!this._calendarCache) {
            try { this._calendarCache = await this.fetchLocalJson('meta/calendar.json'); }
            catch(e) { this._calendarCache = null; }
        }
        return this._calendarCache;
    },

    async fetchYTDRef() {
        if (!this._ytdRefCache) {
            try { this._ytdRefCache = await this.fetchLocalJson('meta/ytd_ref.json'); }
            catch(e) { this._ytdRefCache = { prices: {} }; }
        }
        return this._ytdRefCache;
    },

    async formatSymbol(s) {
        if (s.startsWith('^')) return s;
        const meta = await this.getStocksMeta();
        const info = meta.stocks?.find(item => item.symbol === s);
        if (info) {
            const m = (info.market || '').toUpperCase();
            return (m === 'TPEX' || m === 'TWO' || m === 'OTC') ? `${s}.TWO` : `${s}.TW`;
        }
        if (/^\d{6}$/.test(s)) return `${s}.TWO`;
        return `${s}.TW`;
    },

    async fetchLocalJson(path) {
        const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:';
        let root = '../data/';
        if (window.location.pathname.includes('/temp_repo/web/')) root = '../data/';
        else if (window.location.pathname.includes('/web/')) root = '../temp_repo/data/';
        const url = isLocal ? `${root}${path}` : `https://alien0077.github.io/Public_Data/data/${path}`;
        const cb = isLocal && path.startsWith('meta/actions/') ? `?t=${Date.now()}` : '';
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000);
            const res = await fetch(url + cb, { signal: controller.signal, cache: 'no-cache' });
            clearTimeout(timeoutId);
            if (res.ok) return await res.json();
            throw new Error(`HTTP ${res.status}`);
        } catch (e) { console.warn(`Local fetch failed [${path}]: ${e.message}`); throw e; }
    },

    async fetchWithAuth(endpoint, options = {}) {
        const secret = this.getSecret();
        if (!secret) throw new Error('Unauthorized');
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        try {
            const res = await fetch(`${API_BASE}${endpoint}`, {
                ...options,
                headers: { ...options.headers, 'Authorization': `Bearer ${secret}` },
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            if (!res.ok) {
                if (res.status === 401 && !['local_dev_bypass', 'test'].includes(secret)) {
                    localStorage.removeItem('twstock_secret');
                    window.location.reload();
                }
                throw new Error(`API ${res.status}`);
            }
            return res.json();
        } catch (err) { clearTimeout(timeoutId); throw err; }
    },

    async fetchQuotes(symbols) {
        if (!symbols || symbols.length === 0) return {};
        const [calendar, indexData] = await Promise.all([this.getCalendar(), this.fetchLocalJson('index.json').catch(() => ({}))]);
        const quotes = {};
        const toApi = [], toFallback = [];

        for (const s of symbols) {
            const info = this.getMarketStatus(s, calendar);
            const key = info.market === 'TW' ? 'latest_daily_tw' : 'latest_daily_us';
            if (indexData[key] !== info.marketDate || (info.isTradingDay && info.session === '盤中')) toApi.push(s);
            else toFallback.push(s);
        }

        const map = { 'IX0001': '^TWII', 'TSE': '^TWII', 'IX0043': 'IX0043.TWO', 'OTC': 'IX0043.TWO' };

        if (toApi.length > 0) {
            try {
                const formatted = await Promise.all(toApi.map(s => this.formatSymbol(map[s.replace('^', '').toUpperCase()] || s)));
                const data = await this.fetchWithAuth(`/quote?symbols=${formatted.join(',')}`);
                if (data.quoteResponse?.result) {
                    data.quoteResponse.result.forEach(q => this._populateQuotes(quotes, q.symbol, q.regularMarketPrice, q.regularMarketPreviousClose, q.regularMarketChangePercent, q.shortName, 'REALTIME', toApi, map));
                }
            } catch (err) { console.warn("Quote API Blocked, using Chart Recovery..."); }

            const missing = toApi.filter(s => !quotes[s]);
            if (missing.length > 0) {
                try {
                    const results = await Promise.all(missing.map(async s => {
                        try {
                            const full = await this.formatSymbol(map[s.replace('^', '').toUpperCase()] || s);
                            const c = await this.fetchWithAuth(`/chart?symbol=${full}&range=1d&interval=1m`);
                            if (c.chart?.result?.[0]?.meta) {
                                const m = c.chart.result[0].meta;
                                return { apiSym: m.symbol, price: m.regularMarketPrice, ref: m.chartPreviousClose || m.previousClose, name: m.symbol };
                            }
                        } catch(e) { return null; }
                        return null;
                    }));
                    results.forEach(r => { if (r && r.price) { const pct = ((r.price - r.ref) / r.ref * 100); this._populateQuotes(quotes, r.apiSym, r.price, r.ref, pct, r.name, 'REALTIME_CHART', toApi, map); } });
                } catch(e) {}
            }
            toFallback.push(...toApi.filter(s => !quotes[s]));
        }

        if (toFallback.length > 0) {
            try {
                const lTwIdx = indexData.latest_daily_tw_indices || '2026-05-20', lUs = indexData.latest_daily_us || '2026-05-20', lTw = indexData.latest_daily_tw || '2026-05-21';
                const [idxD, usD, twD] = await Promise.all([this.fetchLocalJson(`daily/tw_indices/${lTwIdx}.json`).catch(() => ({})), this.fetchLocalJson(`daily/us/${lUs}.json`).catch(() => ({})), this.fetchLocalJson(`daily/tw/${lTw}.json`).catch(() => ({}))]);
                const jMap = new Map();
                const reg = (arr, d) => (arr || []).forEach(s => { const i = { ...s, _d: d }; if (s.id) jMap.set(String(s.id).toUpperCase(), i); if (s.symbol) jMap.set(String(s.symbol).toUpperCase(), i); });
                reg(idxD.stocks || idxD.data, lTwIdx); reg(usD.stocks, lUs); reg(twD.stocks, lTw);

                toFallback.forEach(s => {
                    const cs = s.replace('^', '').toUpperCase();
                    const m = jMap.get(s.toUpperCase()) || jMap.get(cs) || jMap.get('^' + cs) || (cs === 'TSE' || cs === 'IX0001' ? (jMap.get('IX0001') || jMap.get('TSE')) : null) || (cs === 'OTC' || cs === 'IX0043' ? (jMap.get('IX0043') || jMap.get('OTC')) : null);
                    if (m) {
                        const price = m.c || m.close || 0, pct = m.pct || 0;
                        quotes[s] = { price, referencePrice: price / (1 + (pct/100)), changePercent: pct.toFixed(2), name: m.n || m.name || s, source: 'EOD_JSON', date: m._d };
                    }
                });
            } catch (e) {}
        }
        return quotes;
    },

    _populateQuotes(quotes, apiSym, price, ref, pct, name, source, symbols, map) {
        const clean = apiSym.replace('^', '').split('.')[0].toUpperCase();
        const obj = { price, referencePrice: ref, changePercent: parseFloat(pct || 0).toFixed(2), name, source, date: new Date().toISOString().split('T')[0] };
        quotes[apiSym] = obj; quotes[clean] = obj;
        if (clean === 'TWII') { quotes['IX0001'] = obj; quotes['TSE'] = obj; }
        if (clean === 'TWOII' || clean === 'IX0043') { quotes['IX0043'] = obj; quotes['OTC'] = obj; }
        symbols.forEach(s => { const cs = s.replace('^', '').toUpperCase(); if ((map[cs] || s).toUpperCase() === apiSym.toUpperCase() || cs === clean) quotes[s] = obj; });
    },

    getMarketStatus(s, cal) {
        const cs = s.replace('^', '').toUpperCase();
        const isTw = ['IX0001', 'IX0043', 'TSE', 'OTC', 'TWII', 'TWOII'].includes(cs) || /^\d+$/.test(cs) || cs.includes('.TW') || cs.includes('.TWO');
        const tz = isTw ? 'Asia/Taipei' : 'America/New_York';
        const zoned = new Date().toLocaleString('en-US', { timeZone: tz, hour12: false });
        const m = zoned.match(/(\d+)\/(\d+)\/(\d+), (\d+):(\d+):(\d+)/);
        if (!m) return { market: isTw ? 'TW' : 'US', isTradingDay: false, session: '休市', marketDate: '' };
        
        const dStr = `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
        const tVal = parseInt(m[4]) * 100 + parseInt(m[5]);
        
        // 🚀 Fix: Correct weekend detection using the zoned date components
        const localDate = new Date(parseInt(m[3]), parseInt(m[1]) - 1, parseInt(m[2]));
        const dayOfWeek = localDate.getDay();
        let closed = (dayOfWeek === 0 || dayOfWeek === 6); // Sat or Sun
        
        const calY = cal?.meta?.years?.[m[3]];
        if (calY && !closed) {
            closed = (isTw ? (calY.tw || []) : (calY.us || [])).includes(dStr);
        }
        
        let sess = '休市';
        if (!closed) {
            if (isTw) {
                if (tVal < 830) sess = '盤前';
                else if (tVal <= 1335) sess = '盤中';
                else if (tVal <= 1430) sess = '盤後';
            } else {
                if (tVal < 930) sess = '盤前';
                else if (tVal <= 1600) sess = '盤中';
                else if (tVal <= 2000) sess = '盤後';
            }
        }
        return { market: isTw ? 'TW' : 'US', marketDate: dStr, isTradingDay: !closed, session: sess };
    },

    async fetchChart(symbol) {
        try {
            const full = await this.formatSymbol(symbol);
            const data = await this.fetchWithAuth(`/chart?symbol=${full}&range=2y&interval=1d`);
            if (data.chart?.result?.[0]) {
                const res = data.chart.result[0], q = res.indicators.quote[0];
                return { timestamp: res.timestamp, open: q.open, high: q.high, low: q.low, close: q.close, volume: q.volume };
            }
            return data;
        } catch (err) { try { return await this.fetchLocalJson(`charts/${symbol.split('.')[0]}.json`); } catch(e) { throw err; } }
    },

    async fetchStructure(symbol) { try { return await this.fetchLocalJson(`structure/daily/${symbol.split('.')[0]}.json`); } catch (e) { return null; } },
    async fetchFinancials(symbol, type = 'quarterly') { try { return await this.fetchLocalJson(`${type}/${symbol.split('.')[0]}.json`); } catch (e) { return null; } },
    async fetchFairValue(symbol) {
        try {
            const data = await this.fetchLocalJson('valuation/fair_value.json');
            return data?.stocks?.[symbol.split('.')[0]] || null;
        } catch (e) { return null; }
    },
    async fetchFairValueMap() {
        if (!this._fairValueMap) {
            try {
                const metrics = await this.fetchStockMetricsMap();
                // List/card consumers only need the current valuation fields.
                // Detail pages continue to call fetchFairValue() for full inputs/reasons.
                this._fairValueMap = Object.fromEntries(Object.entries(metrics).map(([symbol, row]) => [symbol, {
                    status: row.valuation_status,
                    name: row.name,
                    market_price: row.price,
                    fair_value: row.fair_value,
                    upside: row.fair_value_upside,
                    valuation_signal: row.valuation_signal,
                    valuation_signal_label: row.valuation_signal_label,
                    model: row.valuation_model,
                    confidence: row.valuation_confidence,
                    source_dates: row.source_dates
                }]));
            } catch (e) {
                try {
                    const data = await this.fetchLocalJson('valuation/fair_value.json');
                    this._fairValueMap = data?.stocks || {};
                } catch (fallbackError) { this._fairValueMap = {}; }
            }
        }
        return this._fairValueMap;
    },
    async fetchStockMetricsMap() {
        if (!this._stockMetricsCache) {
            try {
                const data = await this.fetchLocalJson('metrics/stock_metrics.json');
                this._stockMetricsCache = data?.stocks || {};
            } catch (e) { this._stockMetricsCache = {}; }
        }
        return this._stockMetricsCache;
    },
    async fetchHealthData(symbol) { try { return await this.fetchLocalJson(`stocks/${symbol.split('.')[0]}.json`); } catch (e) { return null; } },
    async fetchIntradayMarket(symbol) { 
        const quotes = await this.fetchQuotes([symbol, '^TWII']);
        const q = quotes[symbol] || {};
        return { metrics: { outer_ratio: 50, amplitude: 1.5, trades_count: 1200, latest_volume: 500, turnover: 0.5 }, quote: q };
    },
    async fetchShareholders(symbol) { try { return await this.fetchLocalJson(`weekly/shareholders/${symbol.split('.')[0]}.json`); } catch (e) { return null; } },
    async fetchETFHoldings() { try { return await this.fetchLocalJson('quant/etf/outputs/latest_snapshot.json'); } catch (e) { return null; } },
    async fetchETFRebalance() { try { return await this.fetchLocalJson('quant/etf/outputs/rebalance.json'); } catch (e) { return null; } },
    async fetchExchangeRates() {
        try {
            const d = await this.fetchLocalJson('meta/exchange_rate_history.json');
            if (!d?.data?.length) return null;
            const latest = d.data[d.data.length - 1];
            const currencies = [
                { code: 'USD', label: 'USD', flag: '🇺🇸', key: 'USD_TWD' },
                { code: 'JPY', label: 'JPY', flag: '🇯🇵', key: 'JPY_TWD' },
                { code: 'EUR', label: 'EUR', flag: '🇪🇺', key: 'EUR_TWD' },
                { code: 'GBP', label: 'GBP', flag: '🇬🇧', key: 'GBP_TWD' },
                { code: 'HKD', label: 'HKD', flag: '🇭🇰', key: 'HKD_TWD' },
                { code: 'CNY', label: 'CNY', flag: '🇨🇳', key: 'CNY_TWD' },
                { code: 'AUD', label: 'AUD', flag: '🇦🇺', key: 'AUD_TWD' },
                { code: 'THB', label: 'THB', flag: '🇹🇭', key: 'THB_TWD' },
                { code: 'KRW', label: 'KRW', flag: '🇰🇷', key: 'KRW_TWD' },
                { code: 'MYR', label: 'MYR', flag: '🇲🇾', key: 'MYR_TWD' },
                { code: 'VND', label: 'VND', flag: '🇻🇳', key: 'VND_TWD' },
                { code: 'IDR', label: 'IDR', flag: '🇮🇩', key: 'IDR_TWD' }
            ];
            const rates = currencies.map(c => ({ ...c, rate: latest[c.key] }));
            return { date: latest.date, rates };
        } catch (e) { return null; }
    },
    async getStockInfo(symbol) {
        const meta = await this.getStocksMeta();
        const s = symbol.split('.')[0];
        return meta.stocks?.find(item => item.symbol === s) || null;
    },
    async fetchSectorPE() { try { return await this.fetchLocalJson('quant/sector_pe.json'); } catch (err) { return null; } },
    async fetchLiarData() { try { return await this.fetchLocalJson(`daily/liar.json`); } catch (err) { return null; } },

    async fetchQuantMetrics() {
        if (!this._quantMetricsCache) {
            try { this._quantMetricsCache = await this.fetchLocalJson('quant/stock_quant_metrics.json'); }
            catch (e) { this._quantMetricsCache = {}; }
        }
        return this._quantMetricsCache;
    },

    calculateSupportMA(price, chartData) {
        if (!chartData || !chartData.close) return { supportMA: 'X', maBias: null };
        const closes = chartData.close.filter(c => c != null);
        if (closes.length < 20) return { supportMA: 'X', maBias: null };

        const calcMA = (period) => {
            if (closes.length < period) return null;
            const slice = closes.slice(-period);
            return slice.reduce((a, b) => a + b, 0) / period;
        };

        const mas = [
            { name: '5MA', value: calcMA(5) },
            { name: '10MA', value: calcMA(10) },
            { name: '20MA', value: calcMA(20) },
            { name: '60MA', value: calcMA(60) },
            { name: '120MA', value: calcMA(120) },
            { name: '240MA', value: calcMA(240) }
        ].filter(m => m.value !== null).sort((a, b) => a.value - b.value);

        if (mas.length === 0) return { supportMA: 'X', maBias: null };

        const minMA = mas[0], maxMA = mas[mas.length - 1];
        const has240 = mas.some(m => m.name === '240MA');
        const ma10 = mas.find(m => m.name === '10MA');
        const isFalling = ma10 ? price < ma10.value : false;

        if (price > maxMA.value) {
            if (has240) return { supportMA: '🚀全', maBias: (price - maxMA.value) / maxMA.value };
            return { supportMA: '支撐 ' + maxMA.name, maBias: null };
        }
        if (price < minMA.value) {
            return { supportMA: '💀破', maBias: (price - minMA.value) / minMA.value };
        }

        for (let i = 0; i < mas.length - 1; i++) {
            if (price >= mas[i].value && price <= mas[i + 1].value) {
                const label = isFalling ? `${mas[i + 1].name}-${mas[i].name}` : `${mas[i].name}-${mas[i + 1].name}`;
                return { supportMA: label, maBias: null };
            }
        }
        return { supportMA: 'X', maBias: null };
    },
    async fetchMarginStockRankings() { try { return await this.fetchLocalJson('quant/margin_stock_rankings.json'); } catch (e) { return null; } },
    async fetchMarginMaintenance() {
        if (!this._marginMaintenanceCache) {
            try {
                this._marginMaintenanceCache = await this.fetchLocalJson('quant/margin_maintenance.json');
            } catch (e) {
                this._marginMaintenanceCache = { stocks: {} };
            }
        }
        return this._marginMaintenanceCache;
    },
};

window.api = api;
