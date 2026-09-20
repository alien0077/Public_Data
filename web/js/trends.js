/**
 * Trends Module for TWStockTracker Web
 */

import { PUBLIC_DATA_BASE_URL } from './api.js';

export const trends = {
    heatmapInstance: null,
    scatterInstance: null,

    async init() {
        const heatmapContainer = document.getElementById('heatmap-container');
        const scatterContainer = document.getElementById('scatter-container');
        
        if (!heatmapContainer || !scatterContainer) {
            console.error('Trends containers not found');
            return;
        }

        if (this.heatmapInstance) this.heatmapInstance.dispose();
        if (this.scatterInstance) this.scatterInstance.dispose();

        this.heatmapInstance = echarts.init(heatmapContainer);
        this.scatterInstance = echarts.init(scatterContainer);

        window.addEventListener('resize', () => {
            if (this.heatmapInstance) this.heatmapInstance.resize();
            if (this.scatterInstance) this.scatterInstance.resize();
        });

        await this.loadAndRender();
    },

    async loadAndRender() {
        try {
            // 自動偵測路徑：根據當前 URL 判斷是在本地還是 GitHub Pages
            const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
            
            const candidates = [
                    '../data/quant/theme_rotation.json',        // 🚀 v2.19.1: 新版解耦路徑
                    '../../data/quant/theme_rotation.json',     // 容錯
                    `${PUBLIC_DATA_BASE_URL}/quant/theme_rotation.json` // 直接遠端路徑
                ];
            
            let data = null;
            for (const path of candidates) {
                try {
                    const response = await fetch(path);
                    if (response.ok) {
                        data = await response.json();
                        break;
                    }
                } catch (e) {}
            }

            if (!data) throw new Error('Could not load theme_rotation.json');

            this.renderHeatmap(data.themes);
            this.renderScatter(data.themes);
            
            // Update Date Info
            const dateEl = document.getElementById('trends-date');
            if (dateEl) {
                dateEl.textContent = `最後更新: ${data.date} | 市場環境: ${data.regime}`;
            }
            
        } catch (err) {
            console.error('Trends load error:', err);
            const heatmapContainer = document.getElementById('heatmap-container');
            if (heatmapContainer) {
                heatmapContainer.innerHTML = `<div class="flex items-center justify-center h-full text-gray-500">數據載入失敗: ${err.message}</div>`;
            }
        }
    },

    renderHeatmap(themes) {
        if (!this.heatmapInstance) return;

        const option = {
            backgroundColor: 'transparent',
            title: { 
                text: '產業資金流向 (塊大小:佔比, 顏色:漲跌)', 
                left: 'center', 
                textStyle: { color: '#8b949e', fontSize: 12, fontWeight: 'normal' } 
            },
            tooltip: {
                backgroundColor: 'rgba(22, 27, 34, 0.9)',
                borderColor: '#30363d',
                textStyle: { color: '#c9d1d9' },
                formatter: (info) => {
                    const val = info.value;
                    return `<div class="font-bold border-b border-gray-700 mb-1 pb-1">${info.name}</div>
                            資金佔比: <span class="text-blue-400">${val[0]}%</span><br/>
                            平均漲跌: <span class="${val[1] >= 0 ? 'text-red-500' : 'text-green-500'}">${val[1]}%</span>`;
                }
            },
            series: [{
                name: '產業資金',
                type: 'treemap',
                visibleMin: 300,
                label: { 
                    show: true, 
                    formatter: '{b}',
                    fontSize: 10
                },
                upperLabel: {
                    show: false
                },
                itemStyle: {
                    borderColor: '#0f1115',
                    borderWidth: 1,
                    gapWidth: 1
                },
                levels: [
                    {
                        itemStyle: {
                            borderColor: '#0f1115',
                            borderWidth: 2,
                            gapWidth: 2
                        }
                    }
                ],
                data: themes.filter(t => t.name !== 'nan').map(t => ({
                    name: t.name,
                    value: [t.flow_ratio, t.avg_pct],
                    itemStyle: {
                        color: t.avg_pct > 0 ? '#ef4444' : (t.avg_pct < 0 ? '#22c55e' : '#484f58')
                    }
                })),
                breadcrumb: { show: false }
            }]
        };
        this.heatmapInstance.setOption(option);
    },

    renderScatter(themes) {
        if (!this.scatterInstance) return;

        // Calculate average flow for the center line
        const avgFlow = themes.reduce((a, b) => a + b.flow_ratio, 0) / themes.length;

        const option = {
            backgroundColor: 'transparent',
            title: { 
                text: '產業動能象限 (X:漲跌, Y:佔比)', 
                left: 'center', 
                textStyle: { color: '#8b949e', fontSize: 12, fontWeight: 'normal' } 
            },
            tooltip: {
                backgroundColor: 'rgba(22, 27, 34, 0.9)',
                borderColor: '#30363d',
                textStyle: { color: '#c9d1d9' },
                formatter: (params) => {
                    const d = params.data;
                    return `<div class="font-bold border-b border-gray-700 mb-1 pb-1">${d[2]}</div>
                            平均漲跌: <span class="${d[0] >= 0 ? 'text-red-500' : 'text-green-500'}">${d[0]}%</span><br/>
                            資金佔比: <span class="text-blue-400">${d[1]}%</span>`;
                }
            },
            grid: { top: 50, bottom: 50, left: 50, right: 50 },
            xAxis: { 
                type: 'value', 
                name: '平均漲跌 %', 
                nameLocation: 'middle', 
                nameGap: 25,
                nameTextStyle: { color: '#586069', fontSize: 10 },
                axisLabel: { color: '#8b949e', fontSize: 10 },
                axisLine: { lineStyle: { color: '#30363d' } },
                splitLine: { lineStyle: { color: '#161b22' } }
            },
            yAxis: { 
                type: 'value', 
                name: '資金佔比 %',
                nameTextStyle: { color: '#586069', fontSize: 10 },
                axisLabel: { color: '#8b949e', fontSize: 10 },
                axisLine: { lineStyle: { color: '#30363d' } },
                splitLine: { lineStyle: { color: '#161b22' } }
            },
            series: [{
                type: 'scatter',
                symbolSize: (data) => Math.min(60, Math.sqrt(data[1]) * 15 + 5),
                data: themes.filter(t => t.name !== 'nan').map(t => [t.avg_pct, t.flow_ratio, t.name]),
                label: {
                    show: true,
                    formatter: '{@[2]}',
                    position: 'top',
                    color: '#8b949e',
                    fontSize: 9
                },
                itemStyle: {
                    color: (params) => {
                        const pct = params.data[0];
                        return pct > 0 ? '#ef4444' : (pct < 0 ? '#22c55e' : '#8b949e');
                    },
                    opacity: 0.8
                },
                markLine: {
                    silent: true,
                    lineStyle: { color: '#484f58', type: 'dashed', width: 1 },
                    data: [
                        { xAxis: 0 },
                        { yAxis: avgFlow }
                    ],
                    label: { show: false }
                }
            }]
        };

        this.scatterInstance.setOption(option);
    }
};
