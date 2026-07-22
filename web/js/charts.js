/**
 * Charts Module for TWStockTracker Web - Enhanced Visibility
 */

export const charts = {
    instance: null,

    init(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return null;
        if (this.instance) { this.instance.dispose(); this.instance = null; }
        this.instance = echarts.init(container);
        if (!this._hasResizeListener) {
            window.addEventListener('resize', () => { if (this.instance) this.instance.resize(); });
            this._hasResizeListener = true;
        }
        return this.instance;
    },

    renderKLine(symbol, rawData, trades = [], structureData = null, healthData = null) {
        if (!this.instance) return;
        const data = this.transformKData(rawData);
        if (data.categoryData.length === 0) return;

        // 🚀 Calculate 6 MAs
        const ma5 = this.calculateMA(5, data.values);
        const ma10 = this.calculateMA(10, data.values);
        const ma20 = this.calculateMA(20, data.values);
        const ma60 = this.calculateMA(60, data.values);
        const ma120 = this.calculateMA(120, data.values);
        const ma240 = this.calculateMA(240, data.values);
        
        const markLines = [];
        const avgCost = this.calculateAvgCost(trades, symbol);
        if (avgCost > 0) {
            markLines.push({
                yAxis: avgCost,
                label: { formatter: `成本: ${avgCost.toFixed(1)}`, position: 'start', backgroundColor: '#3b82f6', color: '#fff', padding: [2, 4], borderRadius: 2, fontSize: 10 },
                lineStyle: { type: 'dashed', color: '#3b82f6', width: 1, opacity: 0.8 }
            });
        }

        // 🚀 Render Structural Levels (BOS/CHOCH)
        if (structureData && structureData.levels) {
            structureData.levels.forEach(l => {
                if (l.is_broken) return;
                const color = l.type === 'BOS' ? '#ef4444' : '#3b82f6';
                markLines.push({
                    yAxis: l.price,
                    label: { formatter: l.type, position: 'end', fontSize: 9, color: color },
                    lineStyle: { type: 'solid', color: color, width: 1, opacity: 0.4 }
                });
            });
        }

        // 🚀 v1.3: 融資成本線
        if (healthData && healthData.margin) {
            const hm = healthData.margin;
            if (hm.estimated_margin_cost && hm.estimated_margin_cost > 0) {
                markLines.push({
                    yAxis: hm.estimated_margin_cost,
                    label: { formatter: `融資成本: ${hm.estimated_margin_cost.toFixed(1)}`, position: 'start', backgroundColor: '#f97316', color: '#fff', padding: [2, 4], borderRadius: 2, fontSize: 9 },
                    lineStyle: { type: 'dashed', color: '#f97316', width: 1, opacity: 0.7 }
                });
            }
            if (hm.estimated_warning_price_130 && hm.estimated_warning_price_130 > 0) {
                markLines.push({
                    yAxis: hm.estimated_warning_price_130,
                    label: { formatter: `警戒: ${hm.estimated_warning_price_130.toFixed(1)}`, position: 'start', backgroundColor: '#ef4444', color: '#fff', padding: [2, 4], borderRadius: 2, fontSize: 9 },
                    lineStyle: { type: 'dotted', color: '#ef4444', width: 1, opacity: 0.6 }
                });
            }
        }

        // 🚀 Render Trade Icons (markPoints)
        const markPoints = [];
        const rawS = symbol.split('.')[0];
        const relevantTrades = trades.filter(t => (t.symbol || t.stock_id || t.stockId || '').split('.')[0] === rawS);
        
        relevantTrades.forEach(t => {
            const dateStr = this.formatTradeDate(t.date || t.timestamp);
            const idx = data.categoryData.indexOf(dateStr);
            if (idx !== -1) {
                const isBuy = (t.side || t.type || '').toLowerCase().includes('buy') || (t.side || t.type || '').includes('買');
                markPoints.push({
                    name: isBuy ? '買入' : '賣出',
                    coord: [idx, data.values[idx][isBuy ? 2 : 3]], // 0:O, 1:C, 2:L, 3:H
                    value: isBuy ? 'B' : 'S',
                    symbol: 'circle',
                    symbolOffset: [0, isBuy ? 15 : -15],
                    itemStyle: { color: isBuy ? '#ef4444' : '#10b981' },
                    symbolSize: 18,
                    label: { show: true, formatter: isBuy ? 'B' : 'S', fontSize: 9, fontWeight: 'bold', color: '#fff' }
                });
            }
        });

        // 🚀 Render Corporate Action Icons
        if (window.CorporateActions) {
            const actions = window.CorporateActions.getActions(symbol);
            actions.forEach(a => {
                const dateStr = a.ex_date.replace(/-/g, '/');
                const idx = data.categoryData.indexOf(dateStr);
                if (idx !== -1) {
                    markPoints.push({
                        name: '除權息',
                        coord: [idx, data.values[idx][3]], // High
                        value: 'D',
                        symbol: 'pin',
                        symbolOffset: [0, -30],
                        itemStyle: { color: '#f59e0b' },
                        symbolSize: 20,
                        label: { show: true, formatter: 'D', fontSize: 10, color: '#fff' }
                    });
                }
            });
        }

        const isDark = document.documentElement.classList.contains('dark');
        const upColor = '#ef4444';
        const downColor = '#10b981';
        const zoomWindow = this.getInitialKLineWindow(data.categoryData);

        const option = {
            backgroundColor: 'transparent',
            animation: false,
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'cross', label: { backgroundColor: '#374151' } },
                backgroundColor: isDark ? 'rgba(17, 24, 39, 0.95)' : 'rgba(255, 255, 255, 0.95)',
                borderColor: isDark ? '#374151' : '#e5e7eb',
                textStyle: { color: isDark ? '#f3f4f6' : '#1f2937', fontSize: 11 },
                confine: true,
                formatter: (params) => {
                    const k = params.find(p => p.seriesName === 'K線');
                    if (!k) return '';
                    const idx = k.dataIndex;
                    const v = k.data || [];
                    const volume = data.volumes[idx] || 0;
                    return [
                        `<b>${k.axisValue}</b>`,
                        `開盤: ${this.formatTooltipNumber(v[0])}`,
                        `最高: ${this.formatTooltipNumber(v[3])}`,
                        `最低: ${this.formatTooltipNumber(v[2])}`,
                        `收盤: ${this.formatTooltipNumber(v[1])}`,
                        `成交量: ${this.formatTooltipNumber(volume, 0)}`
                    ].join('<br/>');
                }
            },
            grid: [
                { left: '40', right: '10', top: '5%', height: '72%' },
                { left: '40', right: '10', top: '82%', height: '15%' }
            ],
            xAxis: [
                { type: 'category', data: data.categoryData, boundaryGap: true, axisLine: { lineStyle: { color: isDark ? '#374151' : '#e5e7eb' } }, axisLabel: { color: '#9ca3af', fontSize: 10, rotate: 30 } },
                { type: 'category', gridIndex: 1, data: data.categoryData, boundaryGap: true, axisLine: { lineStyle: { color: isDark ? '#374151' : '#e5e7eb' } }, axisTick: { show: false }, axisLabel: { show: false } }
            ],
            yAxis: [
                { scale: true, axisLine: { show: false }, axisLabel: { color: '#9ca3af', fontSize: 10 }, splitLine: { lineStyle: { color: isDark ? '#1f2937' : '#f3f4f6' } } },
                { scale: true, gridIndex: 1, splitNumber: 2, axisLabel: { show: false }, axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false } }
            ],
            dataZoom: [
                {
                    type: 'inside',
                    xAxisIndex: [0, 1],
                    startValue: zoomWindow.startValue,
                    endValue: zoomWindow.endValue,
                    zoomOnMouseWheel: true,
                    moveOnMouseMove: true,
                    moveOnMouseWheel: true
                },
                { show: true, type: 'slider', xAxisIndex: [0, 1], top: '97%', height: 15, startValue: zoomWindow.startValue, endValue: zoomWindow.endValue }
            ],
            series: [
                {
                    name: 'K線', type: 'candlestick', data: data.values,
                    itemStyle: { color: upColor, color0: downColor, borderColor: upColor, borderColor0: downColor },
                    markLine: { symbol: ['none', 'none'], data: markLines },
                    markPoint: { data: markPoints }
                },
                // 🚀 Thicker lines (width: 2) for better visibility
                { name: 'MA5', type: 'line', data: ma5, smooth: true, showSymbol: false, lineStyle: { width: 1.5, color: '#f59e0b', opacity: 0.8 } },
                { name: 'MA10', type: 'line', data: ma10, smooth: true, showSymbol: false, lineStyle: { width: 1.5, color: '#fb923c', opacity: 0.8 } },
                { name: 'MA20', type: 'line', data: ma20, smooth: true, showSymbol: false, lineStyle: { width: 1.5, color: '#3b82f6', opacity: 0.8 } },
                { name: 'MA60', type: 'line', data: ma60, smooth: true, showSymbol: false, lineStyle: { width: 1.5, color: '#a855f7', opacity: 0.8 } },
                { name: 'MA120', type: 'line', data: ma120, smooth: true, showSymbol: false, lineStyle: { width: 1.5, color: '#9ca3af', opacity: 0.8 } },
                { name: 'MA240', type: 'line', data: ma240, smooth: true, showSymbol: false, lineStyle: { width: 1.5, color: '#16a34a', opacity: 0.8 } },
                {
                    name: '成交量', type: 'bar', xAxisIndex: 1, yAxisIndex: 1, data: data.volumes,
                    itemStyle: { color: (p) => { const v = data.values[p.dataIndex]; return v && v[1] >= v[0] ? upColor : downColor; } }
                }
            ]
        };
        this.instance.setOption(option);
    },

    getInitialKLineWindow(categoryData) {
        const endValue = categoryData[categoryData.length - 1];
        const endDate = this.parseCategoryDate(endValue);
        if (!endDate) return { startValue: categoryData[0], endValue };

        const months = window.matchMedia && window.matchMedia('(max-width: 767px)').matches ? 2 : 6;
        const startDate = new Date(endDate);
        startDate.setMonth(startDate.getMonth() - months);

        const startIndex = categoryData.findIndex(dateText => {
            const d = this.parseCategoryDate(dateText);
            return d && d >= startDate;
        });

        return {
            startValue: categoryData[startIndex >= 0 ? startIndex : 0],
            endValue
        };
    },

    parseCategoryDate(dateText) {
        if (!dateText) return null;
        const d = new Date(String(dateText).replace(/\//g, '-'));
        return isNaN(d.getTime()) ? null : d;
    },

    formatTooltipNumber(value, decimals = 2) {
        const n = parseFloat(value);
        if (isNaN(n)) return '--';
        return new Intl.NumberFormat('zh-TW', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        }).format(n);
    },

    formatTradeDate(val) {
        if (!val) return '';
        const d = new Date(typeof val === 'number' ? (val < 10000000000 ? val * 1000 : val) : val);
        if (isNaN(d.getTime())) return '';
        return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
    },

    calculateMA(dayCount, data) {
        const result = [];
        for (let i = 0, len = data.length; i < len; i++) {
            if (i < dayCount - 1) { result.push(null); continue; }
            let sum = 0;
            for (let j = 0; j < dayCount; j++) { sum += data[i - j][1]; }
            result.push(+(sum / dayCount).toFixed(2));
        }
        return result;
    },

    transformKData(rawData) {
        const categoryData = [], values = [], volumes = [];
        if (!rawData) return { categoryData, values, volumes };
        const ts = rawData.timestamps || rawData.timestamp || [];
        const o = rawData.open || [], h = rawData.high || [], l = rawData.low || [], c = rawData.close || [], v = rawData.volume || [];
        for (let i = 0; i < ts.length; i++) {
            if (o[i] === null || c[i] === null) continue;
            const date = new Date(ts[i] * 1000);
            categoryData.push(`${date.getFullYear()}/${String(date.getMonth()+1).padStart(2,'0')}/${String(date.getDate()).padStart(2,'0')}`);
            // Use parseFloat to ensure numerical data
            values.push([ parseFloat(o[i]), parseFloat(c[i]), parseFloat(l[i]), parseFloat(h[i]) ]);
            volumes.push(parseFloat(v[i] || 0));
        }
        return { categoryData, values, volumes };
    },

    calculateAvgCost(trades, symbol) {
        const rawS = symbol.split('.')[0];
        const filtered = trades.filter(t => (t.symbol || t.stock_id || t.stockId || '').split('.')[0] === rawS);
        let shares = 0, cost = 0;
        const sorted = [...filtered].sort((a, b) => new Date(a.date || a.timestamp || a.tradeDate) - new Date(b.date || b.timestamp || b.tradeDate));
        sorted.forEach(t => {
            const type = String(t.side || t.type || '').toLowerCase();
            const q = Math.abs(parseFloat(t.quantity || t.shares || 0));
            const p = parseFloat(t.price || 0);
            if (type.includes('買') || type.includes('buy')) { shares += q; cost += q * p; }
            else if (type.includes('賣') || type.includes('sell')) { if (shares > 0) { const avg = cost / shares; cost = Math.max(0, cost - (q * avg)); shares = Math.max(0, shares - q); } }
        });
        return shares > 0 ? cost / shares : 0;
    }
};

window.charts = charts;
