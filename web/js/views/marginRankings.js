/**
 * Margin Stock Rankings View Module
 * Displays top/bottom stocks across 9 margin pressure categories
 */
import { api } from '../api.js';

export const MarginRankings = {
    currentCategory: 'margin_pressure_highest',

    categories: [
        { key: 'margin_pressure_highest', label: '融資壓力最高', icon: '🔴', color: 'text-red-500' },
        { key: 'estimated_loss_deepest', label: '推估虧損最大', icon: '💸', color: 'text-red-500' },
        { key: 'closest_to_warning', label: '距離警戒最近', icon: '⚠️', color: 'text-orange-500' },
        { key: 'margin_usage_highest', label: '使用率最高', icon: '📊', color: 'text-orange-500' },
        { key: 'margin_increase_5d', label: '5日融資增加', icon: '📈', color: 'text-red-500' },
        { key: 'margin_increase_20d', label: '20日融資增加', icon: '🚀', color: 'text-red-500' },
        { key: 'price_down_margin_up', label: '價跌融資增', icon: '📉', color: 'text-red-500' },
        { key: 'price_up_margin_down', label: '價漲融資減', icon: '📗', color: 'text-green-500' },
        { key: 'margin_market_value_largest', label: '融資市值最大', icon: '🏛️', color: 'text-blue-500' },
    ],

    async show(container) {
        container.innerHTML = `
            <div class="p-4 max-w-4xl mx-auto">
                <div class="flex items-center space-x-2 mb-4">
                    <span class="text-lg">🔬</span>
                    <h2 class="text-lg font-bold">融資壓力排行</h2>
                </div>
                <div id="rank-categories" class="flex flex-wrap gap-2 mb-4"></div>
                <div id="rank-loading" class="text-center py-8 text-gray-500">載入排行資料中...</div>
                <div id="rank-content" class="space-y-2"></div>
            </div>
        `;

        this.renderCategories();
        const data = await api.fetchMarginStockRankings();
        if (!data) {
            document.getElementById('rank-loading').innerHTML = '<div class="text-center py-8 text-gray-500">暫無排行資料</div>';
            return;
        }
        document.getElementById('rank-loading').classList.add('hidden');
        this.data = data;
        this.switchCategory(this.currentCategory);
    },

    renderCategories() {
        const container = document.getElementById('rank-categories');
        container.innerHTML = this.categories.map(cat => `
            <button class="rank-cat-btn px-3 py-1.5 text-xs font-bold rounded-full border transition-all
                ${cat.key === this.currentCategory
                    ? 'bg-blue-500 text-white border-blue-500'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700'}"
                data-cat="${cat.key}">
                ${cat.icon} ${cat.label}
            </button>
        `).join('');

        container.querySelectorAll('.rank-cat-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.switchCategory(btn.dataset.cat);
                this.renderCategories();
            });
        });
    },

    switchCategory(key) {
        this.currentCategory = key;
        const container = document.getElementById('rank-content');
        const entries = this.data[key] || [];
        if (entries.length === 0) {
            container.innerHTML = '<div class="text-center py-8 text-gray-500">該分類暫無資料</div>';
            return;
        }

        container.innerHTML = entries.map((entry, i) => {
            const rank = i + 1;
            const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}`;
            const valStr = entry.value != null ? this.formatValue(entry.value, key) : '';
            const valColor = this.valueColor(entry.value, key);
            return `
                <div class="flex items-center space-x-3 p-3 bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors"
                     onclick="StockDetail.show('${entry.stock_id}')">
                    <span class="w-6 text-center text-sm font-bold ${rank <= 3 ? '' : 'text-gray-400'}">${medal}</span>
                    <div class="flex-1 min-w-0">
                        <div class="text-sm font-semibold truncate">${this.escapeHtml(entry.name || entry.stock_id)}</div>
                        <div class="text-[10px] text-gray-400 font-mono">${entry.stock_id}</div>
                    </div>
                    ${valStr ? `<span class="text-sm font-bold font-mono ${valColor}">${valStr}</span>` : ''}
                </div>
            `;
        }).join('');
    },

    formatValue(val, category) {
        if (category === 'price_down_margin_up' || category === 'price_up_margin_down') return '';
        if (category === 'margin_pressure_highest') return `${Math.round(val)}`;
        if (category === 'margin_market_value_largest') {
            if (val >= 1e9) return `${(val / 1e9).toFixed(1)}B`;
            if (val >= 1e6) return `${(val / 1e6).toFixed(1)}M`;
            return `${(val / 1e4).toFixed(0)}萬`;
        }
        if (category.includes('margin_increase')) return `${(val * 100).toFixed(1)}%`;
        if (category === 'margin_usage_highest') return `${(val * 100).toFixed(1)}%`;
        if (category === 'estimated_loss_deepest') return `${(val * 100).toFixed(1)}%`;
        if (category === 'closest_to_warning') return `${(val * 100).toFixed(1)}%`;
        return val.toFixed(2);
    },

    valueColor(val, category) {
        if (!val) return 'text-gray-500';
        if (category === 'estimated_loss_deepest' || category === 'closest_to_warning') {
            return val < 0 ? 'text-red-500' : 'text-green-500';
        }
        return 'text-gray-900 dark:text-white';
    },

    escapeHtml(str) {
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
};

window.MarginRankings = MarginRankings;
