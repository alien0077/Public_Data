/**
 * Margin Pressure Lookup Utility
 * Pre-loads margin stock rankings and provides badge HTML for any stock.
 */
import { api } from '../api.js';
import { stockMarginPressureBadgeHTML } from './stockListLayout.js';

const MarginPressure = {
    _data: null,
    _loading: false,
    _promise: null,

    async load() {
        if (this._data) return this._data;
        if (this._loading) return this._promise;
        this._loading = true;
        this._promise = api.fetchMarginStockRankings().then(data => {
            const map = {};
            if (!data) return map;
            Object.values(data).forEach(cat => {
                if (!Array.isArray(cat)) return;
                cat.forEach(entry => {
                    if (entry.stock_id && !map[entry.stock_id]) {
                        map[entry.stock_id] = entry.value;
                    }
                });
            });
            this._data = map;
            return map;
        }).catch(() => ({}));
        return this._promise;
    },

    getBadgeHTML(symbol) {
        if (!this._data) return '';
        const val = this._data[symbol];
        if (val == null) return '';
        let level = 'LOW';
        if (val >= 60) level = 'HIGH';
        else if (val >= 40) level = 'CAUTION';
        else if (val >= 20) level = 'NORMAL';
        return stockMarginPressureBadgeHTML(Math.round(val), level);
    }
};

window.MarginPressure = MarginPressure;
export { MarginPressure };
