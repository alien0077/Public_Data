/**
 * Stock Margin Maintenance Lookup Utility
 * Pre-loads stock maintenance ratios and provides badge HTML for any stock.
 */
import { api } from '../api.js';
import { stockMarginMaintenanceBadgeHTML } from './stockListLayout.js';

const MarginPressure = {
    _data: null,
    _loading: false,
    _promise: null,

    async load() {
        if (this._data) return this._data;
        if (this._loading) return this._promise;
        this._loading = true;
        this._promise = api.fetchMarginMaintenance().then(data => {
            const map = {};
            Object.entries(data?.stocks || {}).forEach(([stockId, record]) => {
                const ratio = Number(record?.maintenance_ratio);
                if (stockId && Number.isFinite(ratio) && ratio > 0) map[stockId] = ratio;
            });
            this._data = map;
            return map;
        }).catch(() => ({}));
        return this._promise;
    },

    getBadgeHTML(symbol) {
        if (!this._data) return '';
        const ratio = this._data[symbol];
        return ratio == null ? '' : stockMarginMaintenanceBadgeHTML(ratio);
    }
};

window.MarginPressure = MarginPressure;
export { MarginPressure };
