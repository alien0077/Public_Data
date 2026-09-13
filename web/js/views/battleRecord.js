import { db } from '../db.js';
import { CorporateActions } from '../corporateActions.js';
import { api } from '../api.js';

/**
 * Battle Record View
 * 負責計算並顯示已結算盈虧、勝率與總獲利金額
 */
export const BattleRecord = {
    async init() {
        const viewContainer = document.getElementById('view-performance');
        if (!viewContainer) return;

        viewContainer.innerHTML = `
            <div class="flex flex-col space-y-6 flex-1 overflow-y-auto p-4 md:p-6 no-scrollbar">
                <!-- Summary Stats -->
                <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div class="bg-white dark:bg-[#161b22] p-6 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm">
                        <p class="text-gray-500 text-[10px] uppercase font-bold tracking-wider mb-2">全歷史總盈虧</p>
                        <h3 class="text-3xl font-mono font-bold" id="settled-total-pnl">--</h3>
                    </div>
                    <div class="bg-white dark:bg-[#161b22] p-6 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm">
                        <p class="text-gray-500 text-[10px] uppercase font-bold tracking-wider mb-2">獲利交易數</p>
                        <h3 class="text-3xl font-mono font-bold text-red-500" id="settled-win-count">--</h3>
                    </div>
                    <div class="bg-white dark:bg-[#161b22] p-6 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm">
                        <p class="text-gray-500 text-[10px] uppercase font-bold tracking-wider mb-2">累計股利收入</p>
                        <h3 class="text-3xl font-mono font-bold text-blue-500" id="settled-total-dividend">--</h3>
                    </div>
                    <div class="bg-white dark:bg-[#161b22] p-6 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm">
                        <p class="text-gray-500 text-[10px] uppercase font-bold tracking-wider mb-2">平均勝率</p>
                        <h3 class="text-3xl font-mono font-bold text-purple-500" id="settled-win-rate">--</h3>
                    </div>
                </div>

                <!-- Yearly Summary -->
                <div class="bg-white dark:bg-[#161b22] rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
                    <div class="p-5 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50">
                        <h3 class="font-bold text-gray-900 dark:text-white flex items-center">
                            <span class="mr-2">📅</span> 歷年年度結算
                        </h3>
                    </div>
                    <div class="overflow-x-auto">
                        <table class="w-full text-left">
                            <thead class="bg-gray-50/30 dark:bg-gray-900/30 text-gray-400 text-[10px] uppercase font-mono">
                                <tr>
                                    <th class="px-6 py-3">年度</th>
                                    <th class="px-6 py-3 text-right">已實現價差</th>
                                    <th class="px-6 py-3 text-right">年度股利</th>
                                    <th class="px-6 py-3 text-right">年度合計</th>
                                </tr>
                            </thead>
                            <tbody id="yearly-stats-body" class="divide-y divide-gray-100 dark:divide-gray-800 font-mono text-sm">
                                <tr><td colspan="4" class="px-6 py-8 text-center text-gray-500">計算中...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Settled Groups -->
                <div class="space-y-4" id="settled-groups-container">
                    <div class="text-center py-12 text-gray-500">數據分析中...</div>
                </div>

                <!-- Detail View Overlay -->
                <div id="battle-detail-overlay" class="hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
                    <div class="bg-white dark:bg-[#161b22] w-full max-w-2xl max-h-[85vh] rounded-3xl border border-gray-200 dark:border-gray-800 shadow-2xl flex flex-col overflow-hidden">
                        <div class="p-6 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50/50 dark:bg-gray-900/50">
                            <div>
                                <h3 class="text-xl font-bold text-gray-900 dark:text-white" id="battle-detail-title">個股結算詳情</h3>
                                <p class="text-xs text-gray-500 mt-1" id="battle-detail-subtitle">完整交易紀錄與企業行為時間軸</p>
                            </div>
                            <button id="close-battle-detail" class="w-10 h-10 rounded-full hover:bg-gray-200 dark:hover:bg-gray-800 flex items-center justify-center transition-colors">
                                <span class="text-2xl">&times;</span>
                            </button>
                        </div>
                        <div class="flex-1 overflow-y-auto p-6" id="battle-detail-content">
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('close-battle-detail')?.addEventListener('click', () => {
            document.getElementById('battle-detail-overlay')?.classList.add('hidden');
        });

        await this.render();
    },

    async showDetails(symbol, name) {
        const overlay = document.getElementById('battle-detail-overlay');
        const title = document.getElementById('battle-detail-title');
        const content = document.getElementById('battle-detail-content');
        if (!overlay || !content) return;

        title.textContent = `${symbol} ${name}`;
        content.innerHTML = `<div class="text-center py-8 animate-pulse text-gray-500">載入歷史數據中...</div>`;
        overlay.classList.remove('hidden');

        try {
            const trades = await db.getAllTrades();
            await CorporateActions.loadCorporateActions([symbol]);
            const timeline = CorporateActions.buildTransactionTimeline(trades, symbol);

            timeline.sort((a, b) => {
                if (a.date !== b.date) return b.date.localeCompare(a.date);
                return a.type === 'ACTION' ? -1 : 1;
            });

            if (timeline.length === 0) {
                content.innerHTML = `<div class="text-center py-12 text-gray-500">暫無該股交易紀錄。</div>`;
                return;
            }

            content.innerHTML = `
                <div class="space-y-6 relative before:absolute before:left-[19px] before:top-2 before:bottom-2 before:w-0.5 before:bg-gray-100 dark:before:bg-gray-800">
                    ${timeline.map(item => {
                        if (item.type === 'TRADE') {
                            const t = item.data;
                            const type = (t.side || t.type || '').toLowerCase();
                            const isBuy = type.includes('買') || type.includes('buy');
                            return `
                                <div class="relative pl-12">
                                    <div class="absolute left-0 top-1 w-10 h-10 rounded-full bg-white dark:bg-[#0f1115] border-2 ${isBuy ? 'border-red-500' : 'border-green-500'} flex items-center justify-center z-10 shadow-sm">
                                        <span class="text-xs font-bold ${isBuy ? 'text-red-500' : 'text-green-500'}">${isBuy ? '買' : '賣'}</span>
                                    </div>
                                    <div class="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-2xl border border-gray-100 dark:border-gray-800 transition-colors">
                                        <div class="flex justify-between items-start mb-2">
                                            <div class="text-xs font-mono text-gray-500">${item.date}</div>
                                            <div class="font-mono font-bold text-gray-900 dark:text-white">${this.formatNumber(t.quantity || t.shares, 0)} 股</div>
                                        </div>
                                        <div class="flex justify-between items-end">
                                            <div class="text-sm font-bold ${isBuy ? 'text-red-500' : 'text-green-500'}">${isBuy ? '買入買進' : '賣出結算'}</div>
                                            <div class="text-sm font-mono text-gray-400">@ $${this.formatNumber(t.price)}</div>
                                        </div>
                                    </div>
                                </div>
                            `;
                        } else {
                            const a = item.data;
                            const type = a.type.toUpperCase();
                            let color = 'border-yellow-500 text-yellow-600';
                            let icon = '💰';
                            let desc = '';
                            if (type === 'DIVIDEND' || type === 'CASH_DIVIDEND') {
                                desc = `配息 $${a.cash_dividend || 0}`;
                                if (a.stock_dividend > 0) { desc += ` + 配股 ${a.stock_dividend} 元`; color = 'border-green-500 text-green-600'; icon = '📈'; }
                            } else if (type === 'REDUCTION') {
                                desc = `減資 ${(a.capital_reduction * 100).toFixed(1)}%`; color = 'border-red-400 text-red-500'; icon = '🔻';
                            } else if (type === 'SPLIT') {
                                desc = `拆分比例 ${a.split_ratio}:1`; color = 'border-blue-400 text-blue-500'; icon = '🔄';
                            }
                            return `
                                <div class="relative pl-12">
                                    <div class="absolute left-0 top-1 w-10 h-10 rounded-full bg-white dark:bg-[#0f1115] border-2 ${color.split(' ')[0]} flex items-center justify-center z-10 shadow-sm">
                                        <span class="text-sm">${icon}</span>
                                    </div>
                                    <div class="bg-gray-50/30 dark:bg-gray-900/20 p-4 rounded-2xl border border-dashed border-gray-200 dark:border-gray-800">
                                        <div class="text-xs font-mono text-gray-400 mb-1">${item.date}</div>
                                        <div class="text-sm font-bold ${color.split(' ')[1]}">企業行為：${desc}</div>
                                    </div>
                                </div>
                            `;
                        }
                    }).join('')}
                </div>
            `;
        } catch (err) { content.innerHTML = `<div class="p-8 text-center text-red-500">載入失敗: ${err.message}</div>`; }
    },

    async render() {
        const trades = await db.getAllTrades();
        if (!trades || trades.length === 0) {
            document.getElementById('settled-groups-container').innerHTML = `<div class="text-center py-12 text-gray-500">尚無交易紀錄</div>`;
            return;
        }

        const symbols = Array.from(new Set(trades.map(t => t.symbol || t.stock_id || t.stockId)));
        await CorporateActions.loadCorporateActions(symbols);
        const today = new Date().toISOString().slice(0, 10);
        const holdings = CorporateActions.recalculateHoldings(trades, true, null, today);
        
        const symbolGroups = {};
        trades.forEach(t => {
            const sym = t.symbol || t.stock_id || t.stockId;
            if (!symbolGroups[sym]) symbolGroups[sym] = [];
            symbolGroups[sym].push(t);
        });

        let totalRealizedPNL = 0;
        let totalDividend = 0;
        let totalUnrealizedPNL = 0;
        let winCount = 0;
        let totalSettledCount = 0;

        let quotes = {};
        try { quotes = await api.fetchQuotes(symbols).catch(() => ({})); } catch(e) {}

        const results = [];
        Object.keys(symbolGroups).forEach(sym => {
            const h = holdings[sym] || { realizedPNL: 0, totalDividend: 0, shares: 0, totalCost: 0 };
            let unrealized = null;
            if (h.shares > 0) {
                const q = quotes[sym] || quotes[sym.split('.')[0]] || {};
                const quotePrice = Number(q.price);
                if (Number.isFinite(quotePrice) && quotePrice > 0) {
                    unrealized = (quotePrice * h.shares) - h.totalCost;
                }
            }
            if (unrealized != null) totalUnrealizedPNL += unrealized;
            const totalResult = h.realizedPNL + h.totalDividend + (unrealized ?? 0);

            if (Math.abs(h.realizedPNL) > 0.1 || h.totalDividend > 0 || h.shares > 0) {
                totalRealizedPNL += h.realizedPNL;
                totalDividend += h.totalDividend;
                totalSettledCount++;
                if (totalResult > 0) winCount++;

                results.push({
                    symbol: sym,
                    name: symbolGroups[sym][0].name || symbolGroups[sym][0].stockName || '',
                    pnl: h.realizedPNL,
                    dividend: h.totalDividend,
                    unrealized: unrealized,
                    total: totalResult,
                });
            }
        });

        results.sort((a, b) => b.total - a.total);

        const grandTotal = totalRealizedPNL + totalDividend;
        document.getElementById('settled-total-pnl').textContent = `$${this.formatNumber(grandTotal, 0)}`;
        document.getElementById('settled-total-pnl').className = `text-3xl font-mono font-bold ${grandTotal >= 0 ? 'text-red-500' : 'text-green-500'}`;
        document.getElementById('settled-win-count').textContent = winCount;
        document.getElementById('settled-total-dividend').textContent = `$${this.formatNumber(totalDividend, 0)}`;
        document.getElementById('settled-win-rate').textContent = totalSettledCount > 0 ? `${(winCount/totalSettledCount*100).toFixed(1)}%` : '0%';

        // 🚀 v2.20.0: 渲染年度結算
        const yearlyBody = document.getElementById('yearly-stats-body');
        if (yearlyBody && holdings.yearlyStats) {
            const years = Object.keys(holdings.yearlyStats).sort((a, b) => b - a);
            yearlyBody.innerHTML = years.map(y => {
                const s = holdings.yearlyStats[y];
                const total = s.realizedPNL + s.dividend;
                return `
                    <tr class="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                        <td class="px-6 py-4 font-bold text-gray-900 dark:text-white">${y}</td>
                        <td class="px-6 py-4 text-right ${s.realizedPNL >= 0 ? 'text-red-500' : 'text-green-500'}">
                            ${s.realizedPNL >= 0 ? '+' : ''}${this.formatNumber(s.realizedPNL, 0)}
                        </td>
                        <td class="px-6 py-4 text-right text-blue-500 font-bold">
                            ${this.formatNumber(s.dividend, 0)}
                        </td>
                        <td class="px-6 py-4 text-right font-bold ${total >= 0 ? 'text-red-500' : 'text-green-500'}">
                            ${total >= 0 ? '+' : ''}${this.formatNumber(total, 0)}
                        </td>
                    </tr>
                `;
            }).join('') || '<tr><td colspan="4" class="px-6 py-8 text-center text-gray-500">尚無年度數據</td></tr>';
        }

        const container = document.getElementById('settled-groups-container');
        container.innerHTML = `
            <div class="bg-blue-50 dark:bg-blue-900/10 p-4 rounded-2xl border border-blue-100 dark:border-blue-800/30 text-xs text-blue-600 dark:text-blue-400 mb-6 font-sans text-center">
                💡 全歷史總盈虧 = 已實現價差 + 已入袋股利（截至今日）。個股彙總含未實現損益。
            </div>
            <div class="grid grid-cols-1 gap-4">
                ${results.map(r => `
                    <div class="bg-white dark:bg-[#161b22] rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm hover:border-blue-500/50 transition-all cursor-pointer group" 
                         onclick="BattleRecord.showDetails('${r.symbol}', '${r.name}')">
                        <div class="p-5 flex justify-between items-center">
                            <div class="flex items-center space-x-4">
                                <div class="w-12 h-12 rounded-xl bg-gray-50 dark:bg-gray-900 flex items-center justify-center font-bold text-blue-500 group-hover:scale-110 transition-transform">${r.symbol.substring(0,2)}</div>
                                <div><div class="font-bold text-gray-900 dark:text-white font-sans">${r.symbol}</div><div class="text-xs text-gray-500 font-sans">${r.name}</div></div>
                            </div>
                            <div class="text-right">
                                <div class="text-lg font-mono font-bold ${r.total >= 0 ? 'text-red-500' : 'text-green-500'}">${r.total >= 0 ? '+' : ''}${this.formatNumber(r.total, 0)}</div>
                                <div class="text-[10px] text-gray-400 font-mono">價差: ${r.unrealized == null ? '資料不足' : this.formatNumber(r.pnl + r.unrealized, 0)} | 股利: ${this.formatNumber(r.dividend, 0)}</div>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    },

    formatNumber(num, decimals = 2) {
        return new Intl.NumberFormat('zh-TW', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(num);
    }
};

window.BattleRecord = BattleRecord;
