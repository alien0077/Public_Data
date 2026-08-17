/**
 * Trend Hunter View Module
 * Handles rendering of all Trend Hunter sub-pages
 */

import { api } from '../api.js';
import { stockIdentityHTML, stockMetricHTML, stockMobileCardHTML, fairValueHTML } from '../utils/stockListLayout.js?v=2';
import { StockListPreferences } from '../utils/stockListPreferences.js';
import { canonicalGroupName, openGroupList } from '../utils/groupTaxonomy.js';

function formatStockQuote(quote) {
    const price = Number(quote?.price);
    const referencePrice = Number(quote?.referencePrice);
    let changePercent = Number(quote?.changePercent);
    if (!Number.isFinite(changePercent) && price > 0 && referencePrice > 0) {
        changePercent = ((price - referencePrice) / referencePrice) * 100;
    }
    const hasPrice = Number.isFinite(price) && price > 0;
    const hasChange = hasPrice && Number.isFinite(changePercent);
    return {
        priceText: hasPrice ? price.toLocaleString('zh-TW', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '--',
        changeText: hasChange ? `${changePercent >= 0 ? '▲' : '▼'} ${Math.abs(changePercent).toFixed(2)}%` : '--',
        valueClass: hasChange ? (changePercent >= 0 ? 'text-red-500' : 'text-green-500') : 'text-gray-400'
    };
}

function buildThemeRotationContext(rotationData) {
    const themes = rotationData?.themes || [];
    const flows = themes
        .map(theme => Number(theme.flow_ratio))
        .filter(value => Number.isFinite(value))
        .sort((a, b) => a - b);
    return {
        medianFlow: flows.length ? flows[Math.floor(flows.length / 2)] : 0,
        metricsByName: new Map(themes.map(theme => [theme.name, theme])),
    };
}

function getQuadrantInfo(rotationContext, sectorTag) {
    const metric = rotationContext?.metricsByName?.get(sectorTag);
    const flow = Number(metric?.flow_ratio);
    const pct = Number(metric?.avg_pct);
    if (!Number.isFinite(flow) || !Number.isFinite(pct)) return null;

    if (flow >= rotationContext.medianFlow && pct > 0) {
        return { index: 1, title: '領先', cls: 'bg-red-500/15 text-red-500 border-red-500/30' };
    }
    if (flow < rotationContext.medianFlow && pct > 0) {
        return { index: 2, title: '轉強', cls: 'bg-orange-500/15 text-orange-500 border-orange-500/30' };
    }
    if (flow < rotationContext.medianFlow && pct <= 0) {
        return { index: 3, title: '落後', cls: 'bg-green-500/15 text-green-500 border-green-500/30' };
    }
    return { index: 4, title: '出貨', cls: 'bg-blue-500/15 text-blue-500 border-blue-500/30' };
}

function renderQuadrantBadge(info) {
    if (!info) return '<span class="text-[10px] text-gray-400">--</span>';
    return `<span class="inline-flex items-center justify-center whitespace-nowrap text-[10px] font-bold px-2 py-1 rounded border ${info.cls}" title="第 ${info.index} 象限 · ${info.title}">Q${info.index} ${info.title}</span>`;
}

function renderFlowSparkline(points, color = 'blue') {
    const values = (points || [])
        .map(point => Number(point.value))
        .filter(value => Number.isFinite(value));
    if (values.length < 2) return '<span class="text-[10px] text-gray-400">--</span>';

    const width = 96;
    const height = 28;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = Math.max(max - min, 1);
    const clampY = value => Math.max(2, Math.min(height - 2, height - ((value - min) / range) * height));
    const svgPoints = values.map((value, index) => {
        const x = values.length === 1 ? 0 : (width * index) / (values.length - 1);
        return `${x.toFixed(1)},${clampY(value).toFixed(1)}`;
    }).join(' ');
    const zeroY = clampY(0);
    const stroke = color === 'cyan' ? '#0891b2' : '#2563eb';
    const latest = values[values.length - 1];
    const latestClass = latest >= 0 ? 'text-red-500' : 'text-green-500';
    const latestText = Math.abs(latest) >= 1000 ? `${(latest / 1000).toFixed(1)}K` : latest.toLocaleString();

    return `
        <div class="inline-flex flex-col items-end gap-0.5" title="法人每日淨流入曲線">
            <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" class="block">
                <line x1="0" y1="${zeroY.toFixed(1)}" x2="${width}" y2="${zeroY.toFixed(1)}" stroke="currentColor" class="text-gray-300 dark:text-gray-700" stroke-width="1" />
                <polyline fill="none" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" points="${svgPoints}" />
            </svg>
            <span class="text-[9px] font-bold ${latestClass}">${latest >= 0 ? '+' : ''}${latestText}</span>
        </div>
    `;
}

const MACRO_THEME_NAMES = new Set([
    'AI_Ecosystem', 'Consumer', 'Electronics', 'Energy', 'Financials',
    'Healthcare', 'Industrials', 'Materials', 'Networking', 'Optoelectronics',
    'Real Estate', 'Semiconductor', 'Services', 'Technology', 'Transportation'
]);

const OFFICIAL_SECTOR_NAMES = new Set([
    '半導體業', '電腦及週邊設備業', '電子零組件業', '通信網路業', '光電業',
    '電機機械', '生技醫療業', '金融保險業', '航運業', '汽車工業',
    '建材營造業', '貿易百貨業', '觀光餐旅', '化學工業', '鋼鐵工業',
    '塑膠工業', '水泥工業', '玻璃陶瓷', '橡膠工業', '造紙工業',
    '紡織纖維', '食品工業', '居家生活', '運動休閒', '文化創意業',
    '農業科技業', '電器電纜', '油電燃氣業', '綠能環保', '其他電子業',
    '電子通路業', '資訊服務業', '數位雲端', '其他業'
]);

const AI_THEME_NAMES = new Set([
    '晶圓代工', 'ASIC_IP', 'IC設計_HPC_存儲', 'AI記憶體', '半導體設備_CoWoS',
    '封測_材料', 'AI伺服器代工', '散熱模組', '伺服器機殼_滑軌', '矽光子_CPO',
    'PCB_CCL_ABF', '電源供應器', 'AI玻璃基板', 'AI高功率_功率半導體',
    'BBU_電池備援', '機器人_AI視覺', '機器人_自動化', '網通設備'
]);

const OLD_ECONOMY_KEYWORDS = [
    '航運', '航空', '金融', '金控', '銀行', '保險', '證券', '營建', '建材',
    '食品', '塑膠', '水泥', '玻璃', '橡膠', '造紙', '紡織', '鋼鐵',
    '化學', '百貨', '觀光', '油電', '綠能', '居家', '運動', '文化',
    '農業', 'Transportation', 'Financials', 'Real Estate', 'Materials', 'Consumer'
];

function getRotationViewData(rotationData, view) {
    const themes = rotationData?.themes || [];
    if (view === 'ai') return mergeRotationThemeMetrics(rotationData?.ai_themes || themes.filter(t => AI_THEME_NAMES.has(t.name)));
    if (view === 'macro') return mergeRotationThemeMetrics(themes.filter(t => MACRO_THEME_NAMES.has(t.name)));
    if (view === 'official') return mergeRotationThemeMetrics(themes.filter(t => OFFICIAL_SECTOR_NAMES.has(t.name)));
    if (view === 'old') return mergeRotationThemeMetrics(themes.filter(t => OLD_ECONOMY_KEYWORDS.some(k => String(t.name || '').includes(k))));
    return mergeRotationThemeMetrics(themes);
}

function mergeRotationThemeMetrics(themes) {
    const merged = new Map();
    for (const theme of themes || []) {
        const name = canonicalGroupName(theme.name);
        if (!name) continue;
        const current = merged.get(name);
        if (!current) {
            merged.set(name, { ...theme, name, raw_names: theme.name && theme.name !== name ? [theme.name] : [] });
            continue;
        }
        const flowA = Number(current.flow_ratio) || 0;
        const flowB = Number(theme.flow_ratio) || 0;
        const totalFlow = flowA + flowB;
        const pctA = Number(current.avg_pct) || 0;
        const pctB = Number(theme.avg_pct) || 0;
        current.net_flow = (Number(current.net_flow) || 0) + (Number(theme.net_flow) || 0);
        current.flow_ratio = totalFlow;
        current.avg_pct = totalFlow > 0 ? ((pctA * flowA) + (pctB * flowB)) / totalFlow : Math.max(pctA, pctB);
        current.top_stocks = mergeTopStocks(current.top_stocks, theme.top_stocks);
        if (theme.name && theme.name !== name && !current.raw_names.includes(theme.name)) current.raw_names.push(theme.name);
    }
    return [...merged.values()];
}

function mergeTopStocks(a = [], b = []) {
    const seen = new Set();
    return [...(a || []), ...(b || [])].filter(stock => {
        const id = stock?.id || stock?.stock_id || stock?.symbol;
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
    });
}

function classifyStrengthState(metrics) {
    if (metrics.flow20 > 0 && metrics.avgReturn >= 0 && metrics.breadth >= 0.5 && metrics.flowPersistence >= 0.45) {
        return { label: '強勢延續', cls: 'bg-red-500/10 text-red-500 border-red-500/30', tone: 'red' };
    }
    if ((metrics.flow20 < 0 && metrics.avgReturn < 0) || (metrics.flow5 < 0 && metrics.breadth < 0.35)) {
        return { label: '確認轉弱', cls: 'bg-green-500/10 text-green-500 border-green-500/30', tone: 'green' };
    }
    if (metrics.flow5 < 0 || metrics.latestFlow < 0 || metrics.breadth < 0.45) {
        return { label: '轉弱觀察', cls: 'bg-amber-500/10 text-amber-500 border-amber-500/30', tone: 'amber' };
    }
    return { label: '轉強觀察', cls: 'bg-blue-500/10 text-blue-500 border-blue-500/30', tone: 'blue' };
}

function computeMonthlyStrength(themeData) {
    const flows = (themeData?.industry_net_flow || []).map(Number).filter(Number.isFinite);
    const stocks = themeData?.stocks_data || [];
    const recentFlows = flows.slice(-20);
    const shortFlows = flows.slice(-5);
    const latestReturns = stocks
        .map(s => {
            const vals = s.cumulative_return || [];
            return Number(vals[vals.length - 1]);
        })
        .filter(Number.isFinite);
    const avgReturn = latestReturns.length ? latestReturns.reduce((sum, v) => sum + v, 0) / latestReturns.length : 0;
    const breadth = latestReturns.length ? latestReturns.filter(v => v > 0).length / latestReturns.length : 0;
    const flow20 = recentFlows.reduce((sum, v) => sum + v, 0);
    const flow5 = shortFlows.reduce((sum, v) => sum + v, 0);
    const flowPersistence = recentFlows.length ? recentFlows.filter(v => v > 0).length / recentFlows.length : 0;
    const latestFlow = flows.length ? flows[flows.length - 1] : 0;
    const leader = stocks
        .map(s => ({
            id: s.stock_id,
            name: s.stock_name,
            ret: Number((s.cumulative_return || [])[s.cumulative_return.length - 1] || 0)
        }))
        .filter(s => Number.isFinite(s.ret))
        .sort((a, b) => b.ret - a.ret)[0];
    const metrics = { flow20, flow5, latestFlow, flowPersistence, avgReturn, breadth };
    const state = classifyStrengthState(metrics);
    const score = flow20 + avgReturn * 2 + flowPersistence * 12 + breadth * 10;
    return {
        name: canonicalGroupName(themeData.theme || themeData.theme_en),
        score,
        state,
        leader,
        ...metrics
    };
}

function dedupeStrengthItems(items) {
    const bestByName = new Map();
    for (const item of items || []) {
        if (!item?.name) continue;
        const current = bestByName.get(item.name);
        if (!current || item.score > current.score) bestByName.set(item.name, item);
    }
    return [...bestByName.values()];
}

function renderLongTermStrengthSection(items, textSec, isDark) {
    if (!items.length) {
        return `
            <div class="mt-3 mb-3 p-4 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-500">
                長期資金主線資料載入中
            </div>
        `;
    }
    const strong = items.filter(item => item.state.label === '強勢延續').slice(0, 8);
    const weakening = items.filter(item => item.state.label !== '強勢延續').slice(0, 5);
    const cardBg = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.72)';
    const renderCard = item => {
        const groupName = canonicalGroupName(item.name);
        const encodedGroup = encodeURIComponent(groupName);
        const flowText = `${item.flow20 >= 0 ? '+' : ''}${item.flow20.toFixed(1)} 億`;
        const retText = `${item.avgReturn >= 0 ? '+' : ''}${item.avgReturn.toFixed(1)}%`;
        const breadthText = `${Math.round(item.breadth * 100)}%`;
        const leaderText = item.leader ? `${item.leader.id} ${item.leader.name} ${item.leader.ret >= 0 ? '+' : ''}${item.leader.ret.toFixed(1)}%` : '--';
        return `
            <button type="button" class="w-full text-left p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:ring-2 hover:ring-blue-500/20 active:scale-[0.99] transition cursor-pointer" style="background:${cardBg}" onclick="window.GroupSearch?.openGroup(decodeURIComponent('${encodedGroup}'))" title="查看 ${groupName} 個股列表">
                <div class="flex items-start justify-between gap-2 mb-2">
                    <div class="min-w-0">
                        <div class="text-sm font-bold text-gray-900 dark:text-white truncate">${groupName}</div>
                        <div class="text-[10px] mt-0.5" style="color:${textSec}">領先股：${leaderText}</div>
                    </div>
                    <span class="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded border ${item.state.cls}">${item.state.label}</span>
                </div>
                <div class="grid grid-cols-3 gap-2 text-[10px]">
                    <div><div style="color:${textSec}">20日資金</div><div class="font-bold ${item.flow20 >= 0 ? 'text-red-500' : 'text-green-500'}">${flowText}</div></div>
                    <div><div style="color:${textSec}">均報酬</div><div class="font-bold ${item.avgReturn >= 0 ? 'text-red-500' : 'text-green-500'}">${retText}</div></div>
                    <div><div style="color:${textSec}">廣度</div><div class="font-bold text-gray-900 dark:text-white">${breadthText}</div></div>
                </div>
            </button>
        `;
    };
    return `
        <div class="mt-3 mb-4 p-4 rounded-xl border border-gray-200 dark:border-gray-700" style="background:${isDark ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.025)'}">
            <div class="flex flex-col md:flex-row md:items-end md:justify-between gap-1 mb-3">
                <div>
                    <div class="text-sm font-bold text-gray-900 dark:text-white">長期資金主線</div>
                    <div class="text-xs" style="color:${textSec}">依 30 日月曲線計算 20 日資金、族群廣度與平均報酬</div>
                </div>
                <div class="text-[10px]" style="color:${textSec}">確認轉弱預設保留 5 個交易日觀察</div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 mb-3">
                ${strong.map(renderCard).join('')}
            </div>
            ${weakening.length ? `
                <div class="pt-3 border-t border-gray-200 dark:border-gray-700">
                    <div class="text-xs font-bold mb-2 text-gray-700 dark:text-gray-300">轉弱觀察</div>
                    <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-2">
                        ${weakening.map(renderCard).join('')}
                    </div>
                </div>
            ` : ''}
        </div>
    `;
}

export const TrendHunter = {
    subPageConfigs: {
        '量化精選': {
            title: '量化模型精選',
            description: '基於多因子評分系統，篩選出市場中具備最強動能與基本面支撐的個股。',
            sideTitle: '模型說明',
            sideContent: '我們的量化模型結合了「趨勢動能」、「價值偏離」與「資金集中度」三大維度，每日收盤後自動更新。'
        },
        'ETF戰情': {
            title: 'ETF 市場戰情室',
            description: '追蹤全台 ETF 資金流向、折溢價與產業曝險分佈。',
            sideTitle: '市場感測',
            sideContent: '目前高股息 ETF 資金持續流入，但需注意部分電子權值型 ETF 的成分股重疊風險。'
        },
        'ETF流量': {
            title: 'ETF 集體買賣超',
            description: '追蹤所有 ETF 集體對個股的淨買超/淨賣超排行，掌握 ETF 資金的真正流向。',
            sideTitle: '流量說明',
            sideContent: '計算所有 ETF 對每檔個股的持股比重增減，排序出最受 ETF 青睞或拋售的標的。'
        },
        '精選策略': {
            title: 'AI 策略實驗室',
            description: '展示各種經典與現代交易策略在當前市場的運行表現。',
            sideTitle: '策略統計',
            sideContent: '突破策略在近期震盪盤勢中表現較佳，而均線回歸策略則面臨較大的回撤。'
        },
        '今日最熱': {
            title: '今日熱點掃描',
            description: '即時監測市場中成交量異動、漲幅居前與社群討論度最高的個股。',
            sideTitle: '熱力指標',
            sideContent: '今日 AI 伺服器供應鏈出現集體量噴，資金有從航運板塊轉移至電子零組件的跡象。'
        },
        '法人建倉': {
            title: '法人佈局密碼',
            description: '偵測法人低檔潛伏建倉的量化籌碼流訊號，掌握 AI 族群輪動先機。',
            sideTitle: '訊號說明',
            sideContent: 'A=低檔潛伏建倉: 橫盤+法人吸籌+籌碼沉澱。A+=起跑試探: 量能微溫+均線糾結。B=突發攻擊: 爆量長紅+法人支撐。清單依法人累計買超由大到小排序。'
        },
        '短期快篩': {
            title: '法人短期快篩',
            description: '以最近 10 個交易日法人買盤數據，快速掃描哪些 AI 股被法人持續積極建倉。',
            sideTitle: '快篩說明',
            sideContent: '純粹看法人買盤行為：無價格限制、無停損、無狀態機。依累計買超排序，輔以買入天數一致性判斷。🔥 積極布局(≥80%天數買超) / 👀 持續買進(≥60%) / ⚡ 加速建倉(近3日買超為前期2倍以上)。'
        },
        '族群本益比': {
            title: 'AI 族群本益比',
            description: '依 AI 產業分組，列出各檔個股目前的本益比，快速掌握哪些標的處於低基期。',
            sideTitle: '本益比說明',
            sideContent: 'PE = 收盤價 ÷ 最近期年度 EPS。🔵 低基期 = PE 低於產業中位數 20% 以上；中性 = 落在中位數 ±20% 區間；🔴 偏高 = 高於中位數 20% 以上；虧損中 = EPS ≤ 0。方便判斷各產業內相對便宜的標的。'
        },
        '資金輪動': {
            title: '產業資金輪動圖',
            description: '視覺化呈現資金在不同產業間的轉移路徑，捕捉下一個領漲族群。',
            sideTitle: '象限解讀',
            sideContent: '處於右上象限的產業代表「量價齊揚」，通常是短線資金的主戰場。'
        },
        '熱力圖': {
            title: '全市場熱力圖',
            description: '按市值權重與漲跌幅展現全市場個股表現，一目了然市場強弱。',
            sideTitle: '權重觀察',
            sideContent: '半導體權值股今日撐盤力道強，雖然中小個股跌多漲少，但大盤指數相對穩健。'
        },
        '我的收藏': {
            title: '趨勢收藏夾',
            description: '您收藏的策略、產業或特定個股的追蹤組合。',
            sideTitle: '提醒設定',
            sideContent: '您可以針對收藏的對象設定關鍵價格提醒，當趨勢觸發時系統將第一時間通知您。'
        }
    },

    init(subPage) {
        console.log('TrendHunter initializing subPage:', subPage);
        const container = document.getElementById('view-trendHunter');
        if (!container) {
            console.error('view-trendHunter container not found');
            return;
        }

        // Ensure container is visible and has correct class for layout
        container.classList.remove('hidden');

        // Render the main responsive layout
        this.renderLayout(container, subPage);

        // 🚀 v2.2.0: 執行子分頁視覺化邏輯
        this.initSubPageLogic(subPage);
    },

    renderLayout(container, subPage) {
        const config = this.subPageConfigs[subPage] || {
            title: subPage,
            description: '模組開發中...',
            sideTitle: '資訊說明',
            sideContent: '此模組的詳細數據正在對接中，請稍候。'
        };

        container.innerHTML = `
            <div class="flex flex-col space-y-4 mb-6">
                <div class="flex justify-between items-end">
                    <div>
                        <h2 class="text-2xl font-bold text-gray-900 dark:text-white">${config.title}</h2>
                        <p class="text-gray-500 mt-1">${config.description}</p>
                    </div>
                    <div class="text-xs text-gray-400 font-mono bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded-full">
                        Update: ${new Date().toLocaleDateString()}
                    </div>
                </div>
            </div>

            <div class="space-y-6">
                <div class="bg-white dark:bg-[#161b22] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden min-h-[500px] flex flex-col">
                    <details class="flex-none border-b border-gray-100 dark:border-gray-800">
                        <summary class="px-5 py-3 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 cursor-pointer select-none flex items-center font-bold">
                            <span class="mr-2">💡</span> ${config.sideTitle}
                            <svg class="ml-2 w-3 h-3 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                        </summary>
                        <div class="px-5 pb-4 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">${config.sideContent}</div>
                    </details>
                    ${this.getMainContentPlaceholder(subPage)}
                </div>
            </div>
        `;
    },

    getMainContentPlaceholder(subPage) {
        if (subPage === '資金輪動' || subPage === '熱力圖') {
            return `
                <div class="p-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50/50 dark:bg-gray-900/50">
                    <span class="text-sm font-bold">視覺化分析視圖</span>
                    <div class="flex space-x-2">
                        <div class="w-3 h-3 rounded-full bg-red-500"></div>
                        <div class="w-3 h-3 rounded-full bg-yellow-500"></div>
                        <div class="w-3 h-3 rounded-full bg-green-500"></div>
                    </div>
                </div>
                <div id="trend-chart-container" class="w-full min-h-[800px] p-2 flex flex-col">
                    <div class="text-center">
                        <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
                        <p class="text-gray-500">正在準備 ECharts 視覺化組件...</p>
                    </div>
                </div>
            `;
        }

        if (subPage === '量化精選') {
            return `
                <div id="quant-container" class="p-6 space-y-6 flex-1 flex flex-col">
                    <div id="regime-banner" class="hidden"></div>
                    <div id="quant-strategy-selector"></div>
                    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4" id="quant-stats">
                        <div class="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl border border-gray-100 dark:border-gray-800">
                            <div class="text-xs text-gray-500 mb-1 font-bold">模型淨值 NAV</div>
                            <div class="h-6 w-20 bg-gray-200 dark:bg-gray-800 rounded animate-pulse"></div>
                        </div>
                        <div class="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl border border-gray-100 dark:border-gray-800">
                            <div class="text-xs text-gray-500 mb-1 font-bold">多空狀態 Regime</div>
                            <div class="h-6 w-16 bg-gray-200 dark:bg-gray-800 rounded animate-pulse"></div>
                        </div>
                        <div class="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl border border-gray-100 dark:border-gray-800">
                            <div class="text-xs text-gray-500 mb-1 font-bold">保留現金比率</div>
                            <div class="h-6 w-16 bg-gray-200 dark:bg-gray-800 rounded animate-pulse"></div>
                        </div>
                        <div class="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl border border-gray-100 dark:border-gray-800">
                            <div class="text-xs text-gray-500 mb-1 font-bold">目前持股檔數</div>
                            <div class="h-6 w-12 bg-gray-200 dark:bg-gray-800 rounded animate-pulse"></div>
                        </div>
                    </div>
                    <div id="quant-live-pms" class="hidden"></div>
                    <div id="quant-capital-dashboard" class="hidden"></div>
                    <div id="quant-alpha-allocation" class="hidden"></div>
                    <div class="bg-white dark:bg-[#161b22] rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                        <div class="p-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50/50 dark:bg-gray-900/50">
                            <h3 class="font-bold text-gray-900 dark:text-white flex items-center text-sm">
                                <span class="mr-2">📈</span> 模型持股組合
                            </h3>
                        </div>
                        <div id="quant-holdings-mobile" class="md:hidden divide-y divide-gray-100 dark:divide-gray-800"></div>
                        <div class="overflow-x-auto hidden md:block">
                            <table class="w-full text-left stock-list-table" id="quant-holdings-table">
                                <thead class="bg-gray-50/50 dark:bg-gray-900/50 text-gray-400 text-xs uppercase">
                                    <tr>
                                        <th class="px-6 py-3">股號/名稱</th>
                                         <th class="px-6 py-3 text-right">現價</th>
                                         <th class="px-6 py-3 text-right">漲跌幅</th>
                                         <th class="px-6 py-3 text-left">原因</th>
                                         <th class="px-6 py-3 text-right">配置權重</th>
                                         <th class="px-6 py-3 text-right">進場日期</th>
                                         <th class="px-6 py-3 text-right">持有股數</th>
                                         <th class="px-6 py-3 text-right">買入價</th>
                                         <th class="px-6 py-3 text-right">累積回報</th>
                                         <th class="px-6 py-3 text-right">籌碼特徵</th>
                                         <th class="px-6 py-3 text-right">操作建議</th>
                                         <th class="px-6 py-3 text-right">本益比</th>
                                         <th class="px-6 py-3 text-right">公允價</th>
                                     </tr>
                                </thead>
                                <tbody class="divide-y divide-gray-100 dark:divide-gray-800 font-mono text-sm text-gray-400">
                                    <tr><td colspan="8" class="px-6 py-8 text-center text-gray-500">加載數據中...</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <div id="quant-trade-log" class="hidden"></div>
                    <div class="bg-white dark:bg-[#161b22] rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden flex flex-col">
                        <div class="p-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50 flex-none">
                            <h3 class="font-bold text-gray-900 dark:text-white flex items-center text-sm">
                                <span class="mr-2">⚡</span> 最新選股訊號 (近 5 日)
                            </h3>
                        </div>
                        <div class="overflow-x-auto flex-1">
                            <table class="w-full text-left" id="quant-signals-table">
                                <thead class="bg-gray-50/50 dark:bg-gray-900/50 text-gray-400 text-xs uppercase">
                                    <tr>
                                        <th class="px-6 py-3">訊號日期</th>
                                        <th class="px-6 py-3">股號</th>
                                        <th class="px-6 py-3">訊號類型</th>
                                        <th class="px-6 py-3 text-right">本益比</th>
                                        <th class="px-6 py-3">觸發原因</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-gray-100 dark:divide-gray-800 font-mono text-sm text-gray-400">
                                    <tr><td colspan="5" class="px-6 py-8 text-center text-gray-500">加載數據中...</td></tr>
                                </tbody>
                            </table>
                        </div>
                        <div id="quant-signals-pagination" class="p-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50/30 dark:bg-gray-900/30 flex justify-between items-center text-xs text-gray-500">
                        </div>
                    </div>
                </div>
            `;
        }

        if (subPage === '法人建倉') {
            return `
                <div id="inst-track-container" class="p-6 space-y-4 flex-1 flex flex-col">
                    <div id="inst-track-summary" class="hidden"></div>
                    <div id="inst-track-sectors" class="space-y-3 flex-1"></div>
                    <div id="inst-track-empty" class="flex-1 flex items-center justify-center">
                        <div class="text-center">
                            <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
                            <p class="text-gray-500 text-sm">正在載入法人建倉數據...</p>
                        </div>
                    </div>
                </div>
            `;
        }

        if (subPage === '短期快篩') {
            return `
                <div id="rapid-screen-container" class="p-6 space-y-4 flex-1 flex flex-col">
                    <div id="rapid-screen-summary" class="hidden"></div>
                    <div id="rapid-screen-list" class="space-y-1 flex-1"></div>
                    <div id="rapid-screen-empty" class="flex-1 flex items-center justify-center">
                        <div class="text-center">
                            <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-600 mb-4"></div>
                            <p class="text-gray-500 text-sm">正在掃描法人買盤數據...</p>
                        </div>
                    </div>
                </div>
            `;
        }

        if (subPage === '族群本益比') {
            return `
                <div id="sector-pe-container" class="p-6 space-y-4 flex-1 flex flex-col">
                    <div id="sector-pe-list" class="space-y-3 flex-1"></div>
                    <div id="sector-pe-empty" class="flex-1 flex items-center justify-center">
                        <div class="text-center">
                            <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600 mb-4"></div>
                            <p class="text-gray-500 text-sm">正在計算本益比數據...</p>
                        </div>
                    </div>
                </div>
            `;
        }

        if (subPage === '精選策略') {
            return `
                <div id="strategies-container" class="p-6 grid grid-cols-1 md:grid-cols-2 gap-6 flex-1   ">
                    <div class="col-span-full text-center py-12 text-gray-500">正在加載量化策略...</div>
                </div>
            `;
        }

        if (subPage === '今日最熱') {
            return `
                <div id="hottest-container" class="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1   ">
                    <div class="col-span-full text-center py-12 text-gray-500">正在掃描今日市場熱點...</div>
                </div>
            `;
        }

        if (subPage === 'ETF流量') {
            return `
                <div id="etf-flow-container" class="p-6 space-y-6 flex-1 flex flex-col overflow-y-auto no-scrollbar pb-20">
                    <div class="flex items-center gap-2 mb-2">
                        <button id="etf-flow-tab-flow" class="etf-flow-tab px-4 py-2 rounded-lg text-sm font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 transition-all">個股淨流量</button>
                        <button id="etf-flow-tab-perf" class="etf-flow-tab px-4 py-2 rounded-lg text-sm font-bold text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all">ETF 年績效</button>
                    </div>

                    <div id="etf-flow-panel-flow">
                        <div class="bg-white dark:bg-[#161b22] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
                            <div class="p-5 border-b border-gray-100 dark:border-gray-800 bg-gradient-to-r from-green-500/5 to-transparent">
                                <h3 class="font-bold text-gray-900 dark:text-white flex items-center">
                                    <span class="mr-2 text-xl">📈</span> ETF 集體淨買超 Top 20
                                </h3>
                                <p class="text-xs text-gray-500 mt-1">所有 ETF 合計對個股的淨持股比重增減，正數代表集體加碼</p>
                            </div>
                            <div class="p-5 overflow-x-auto">
                                <div id="etf-flow-buy-table"></div>
                            </div>
                        </div>
                        <div class="bg-white dark:bg-[#161b22] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
                            <div class="p-5 border-b border-gray-100 dark:border-gray-800 bg-gradient-to-r from-red-500/5 to-transparent">
                                <h3 class="font-bold text-gray-900 dark:text-white flex items-center">
                                    <span class="mr-2 text-xl">📉</span> ETF 集體淨賣超 Top 20
                                </h3>
                                <p class="text-xs text-gray-500 mt-1">所有 ETF 合計對個股的淨持股比重增減，負數代表集體減碼</p>
                            </div>
                            <div class="p-5 overflow-x-auto">
                                <div id="etf-flow-sell-table"></div>
                            </div>
                        </div>
                    </div>

                    <div id="etf-flow-panel-perf" class="hidden">
                        <div class="bg-white dark:bg-[#161b22] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
                            <div class="p-5 border-b border-gray-100 dark:border-gray-800 bg-gradient-to-r from-purple-500/5 to-transparent">
                                <h3 class="font-bold text-gray-900 dark:text-white flex items-center">
                                    <span class="mr-2 text-xl">🏆</span> ETF 年度績效 Top 20
                                </h3>
                                <p class="text-xs text-gray-500 mt-1">從年度首筆持倉快照至今的淨值成長率排名</p>
                            </div>
                            <div class="p-5 overflow-x-auto">
                                <div id="etf-flow-performance-table"></div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }

        if (subPage === 'ETF戰情') {
            return `
                <div id="etf-container" class="p-6 space-y-8 flex-1 flex flex-col overflow-y-auto no-scrollbar pb-20">
                    <!-- 🚀 Standalone Momentum Block -->
                    <div class="bg-white dark:bg-[#161b22] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
                        <div class="p-5 border-b border-gray-100 dark:border-gray-800 bg-gradient-to-r from-blue-500/5 to-transparent flex items-center justify-between">
                            <h3 class="font-bold text-gray-900 dark:text-white flex items-center">
                                <span class="mr-2 text-xl">🚀</span> ETF 資金動能榜 (按族群)
                            </h3>
                            <span class="text-[10px] text-blue-500 font-mono font-bold px-2 py-1 bg-blue-500/10 rounded-full">HOT THEMES</span>
                        </div>
                        <div class="p-5 overflow-x-auto">
                            <div id="etf-momentum-list" class="flex space-x-4 min-w-max pb-2">
                                <div class="animate-pulse flex space-x-4">
                                    <div class="h-20 w-40 bg-gray-100 dark:bg-gray-800 rounded-xl"></div>
                                    <div class="h-20 w-40 bg-gray-100 dark:bg-gray-800 rounded-xl"></div>
                                    <div class="h-20 w-40 bg-gray-100 dark:bg-gray-800 rounded-xl"></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Top Selector & Info -->
                    <div class="bg-white dark:bg-[#161b22] p-6 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm">
                        <div class="flex flex-col md:flex-row md:items-center justify-between mb-6 space-y-4 md:space-y-0">
                            <div>
                                <h3 class="font-bold text-lg text-gray-900 dark:text-white flex items-center">
                                    <span class="mr-2">📁</span> ETF 持股細節查詢
                                </h3>
                                <p class="text-xs text-gray-500 mt-0.5" id="etf-updated-time">數據更新中...</p>
                            </div>
                            <div class="relative min-w-[280px]">
                                <select id="etf-select" class="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none appearance-none cursor-pointer text-gray-800 dark:text-gray-200 shadow-inner">
                                    <option value="">-- 請選擇 ETF --</option>
                                </select>
                                <div class="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">▼</div>
                            </div>
                        </div>

                        <div id="etf-meta-display" class="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div class="p-3 bg-blue-500/5 dark:bg-blue-500/10 rounded-xl border border-blue-500/10">
                                <div class="text-[10px] text-gray-400 mb-1 uppercase font-bold">ETF 名稱</div>
                                <div class="text-sm font-bold text-blue-600 dark:text-blue-400 truncate" id="etf-meta-name">--</div>
                            </div>
                            <div class="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-800">
                                <div class="text-[10px] text-gray-400 mb-1 uppercase font-bold">分類</div>
                                <div class="text-sm font-bold text-gray-700 dark:text-gray-300" id="etf-meta-category">--</div>
                            </div>
                            <div class="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-800">
                                <div class="text-[10px] text-gray-400 mb-1 uppercase font-bold">成份股數</div>
                                <div class="text-sm font-bold text-gray-700 dark:text-gray-300" id="etf-meta-count">--</div>
                            </div>
                            <div class="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-800">
                                <div class="text-[10px] text-gray-400 mb-1 uppercase font-bold">預估折溢價</div>
                                <div class="text-sm font-bold text-orange-500" id="etf-meta-premium">--%</div>
                            </div>
                        </div>
                    </div>

                    <!-- ETF 成分股權重圓餅圖 -->
                    <div id="etf-pie-chart" class="w-full h-72 bg-white dark:bg-[#161b22] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm p-2 hidden"></div>

                    <!-- ETF 主題資金流 -->
                    <div id="etf-category-summary" class="hidden"></div>

                    <!-- ETF 股動輪轉 -->
                    <div id="etf-rotation" class="hidden"></div>

                    <!-- ETF 換股動向 -->
                    <div id="etf-rebalance" class="hidden"></div>

                    <!-- Holdings Table -->
                    <div class="bg-white dark:bg-[#161b22] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden flex-1 flex flex-col min-h-[450px]">
                        <div class="p-5 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50 flex justify-between items-center">
                            <h3 class="font-bold text-gray-900 dark:text-white flex items-center">
                                <span class="mr-2">📊</span> 成分股權重分佈 (Top 50)
                            </h3>
                        </div>
                        <div class="overflow-x-auto flex-1">
                            <table id="etf-holdings-table" class="w-full text-left text-sm stock-list-table">
                                <thead class="bg-gray-50/30 dark:bg-gray-800/30 text-gray-400 uppercase font-mono text-[10px]">
                                    <tr>
                                        <th class="px-6 py-3">代號 ID</th>
                                        <th class="px-6 py-3">名稱 NAME</th>
                                        <th class="px-6 py-3 text-right">權重 WEIGHT</th>
                                        <th class="px-6 py-3 text-right">操作 ACTION</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
                                    <tr><td colspan="4" class="px-6 py-12 text-center text-gray-500">請先選擇欲查看的 ETF</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            `;
        }

        // Default: Table placeholder
        return `
            <div class="p-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
                <h3 class="font-bold text-gray-900 dark:text-white">數據清單</h3>
                <div class="flex space-x-2">
                    <input type="text" placeholder="搜尋..." class="text-xs bg-gray-100 dark:bg-gray-800 border-none rounded-md px-3 py-1 outline-none focus:ring-1 ring-blue-500">
                </div>
            </div>
            <div class="flex-1 overflow-x-auto">
                <table class="w-full text-left">
                    <thead class="bg-gray-50/50 dark:bg-gray-900/50 text-gray-400 dark:text-gray-500 text-xs uppercase">
                        <tr>
                            <th class="px-6 py-4">項目</th>
                            <th class="px-6 py-4 text-right">數值</th>
                            <th class="px-6 py-4 text-right">變化</th>
                            <th class="px-6 py-4 text-right">評級</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-100 dark:divide-gray-800 font-mono text-sm text-gray-400">
                        ${Array(10).fill(0).map((_, i) => `
                            <tr>
                                <td class="px-6 py-4">
                                    <div class="w-24 h-4 bg-gray-200 dark:bg-gray-800 rounded animate-pulse"></div>
                                </td>
                                <td class="px-6 py-4 text-right">
                                    <div class="w-16 h-4 bg-gray-200 dark:bg-gray-800 rounded animate-pulse ml-auto"></div>
                                </td>
                                <td class="px-6 py-4 text-right">
                                    <div class="w-12 h-4 bg-gray-200 dark:bg-gray-800 rounded animate-pulse ml-auto"></div>
                                </td>
                                <td class="px-6 py-4 text-right">
                                    <div class="w-8 h-4 bg-gray-200 dark:bg-gray-800 rounded animate-pulse ml-auto"></div>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    },

    async initSubPageLogic(subPage) {
        console.log(`SubPage ${subPage} logic initialized`);

        if (subPage === '法人建倉') {
            const sectorsContainer = document.getElementById('inst-track-sectors');
            const emptyContainer = document.getElementById('inst-track-empty');
            const summaryEl = document.getElementById('inst-track-summary');
            if (!sectorsContainer) return;

            try {
                const data = await api.fetchLocalJson('quant/institutional_leaderboard.json');
                const rotationData = await api.fetchLocalJson('quant/theme_rotation.json').catch(() => null);
                const fairValueMap = await api.fetchFairValueMap().catch(() => ({}));
                const quoteMap = await api.fetchQuotes([...new Set((data?.sectors || []).flatMap(sector => (sector.stocks || []).map(stock => stock.stock_id)))]).catch(() => ({}));
                const rotationContext = buildThemeRotationContext(rotationData);
                if (!data || !data.sectors || data.sectors.length === 0) {
                    if (emptyContainer) emptyContainer.innerHTML = '<div class="text-center py-12 text-gray-500">目前無符合法人低檔建倉條件的標的</div>';
                    return;
                }

                if (emptyContainer) emptyContainer.style.display = 'none';

                if (summaryEl) {
                    summaryEl.classList.remove('hidden');
                    summaryEl.innerHTML = `
                        <div class="bg-gradient-to-r from-blue-600/10 to-indigo-600/10 rounded-2xl border border-blue-500/20 p-4 flex items-center justify-between">
                            <div>
                                <span class="text-sm font-bold text-gray-900 dark:text-white">📡 監控中 AI 族群</span>
                                <span class="ml-2 text-xs text-gray-500">${data.total_tracking} 檔個股法人建倉中</span>
                            </div>
                            <span class="text-xs text-gray-400 font-mono">${data.date}</span>
                        </div>
                    `;
                }

                sectorsContainer.innerHTML = data.sectors.map(sector => `
                    <div class="bg-white dark:bg-[#161b22] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
                        <div class="px-5 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors sector-accordion-header"
                             onclick="this.nextElementSibling.classList.toggle('hidden'); this.querySelector('.chevron').classList.toggle('rotate-180')">
                            <div class="flex items-center space-x-3">
                                <span class="text-lg">${sector.emoji || '📁'}</span>
                                <div>
                                    <div class="font-bold text-gray-900 dark:text-white text-sm">${sector.display_tag || sector.sector_tag}</div>
                                    <div class="text-xs ${sector.tracking_count >= 3 ? 'text-orange-500' : 'text-gray-400'}">
                                        ${sector.tracking_count} 檔個股法人建倉中
                                    </div>
                                </div>
                            </div>
                            <div class="flex items-center space-x-3">
                                <span class="text-xs text-gray-400 font-mono">${sector.stocks.length} 檔</span>
                                <svg class="chevron w-4 h-4 text-gray-400 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                                </svg>
                            </div>
                        </div>
                        <div class="md:hidden divide-y divide-gray-100 dark:divide-gray-800">
                            ${sector.stocks.map(s => {
                                const fairValue = fairValueMap[s.stock_id];
                                const quote = formatStockQuote(quoteMap[s.stock_id]);
                                const quadrantBadge = renderQuadrantBadge(getQuadrantInfo(rotationContext, sector.sector_tag));
                                const flowSparkline = renderFlowSparkline(s.daily_inst_flow, 'blue');
                                const ret = s.current_return || 0;
                                const retStr = (ret >= 0 ? '+' : '') + (ret * 100).toFixed(1) + '%';
                                const retClass = ret >= 0 ? 'text-red-500' : 'text-green-500';
                                const buyStr = s.accumulated_inst_buy >= 1000
                                    ? (s.accumulated_inst_buy / 1000).toFixed(1) + 'K'
                                    : s.accumulated_inst_buy.toLocaleString();
                                const signalConfig = {
                                    'B': { icon: '🔴', label: 'B 發動', cls: 'bg-red-500/15 text-red-500 border-red-500/30' },
                                    'A+': { icon: '🟠', label: 'A+ 起跑', cls: 'bg-orange-500/15 text-orange-500 border-orange-500/30' },
                                    'A': { icon: '🔵', label: 'A 潛伏', cls: 'bg-blue-500/15 text-blue-500 border-blue-500/30' },
                                    'ABS': { icon: '🟣', label: 'ABS 絕對買超', cls: 'bg-purple-500/15 text-purple-500 border-purple-500/30' },
                                };
                                const sig = signalConfig[s.latest_signal_code];
                                const entrySig = signalConfig[s.entry_signal_code];
                                const entryBadge = entrySig
                                    ? `<span class="text-[9px] font-bold px-1.5 py-0.5 rounded border ${entrySig.cls}">進場 ${entrySig.label}</span>`
                                    : '';
                                const signalBadge = sig
                                    ? `<span class="text-[10px] font-bold px-2 py-1 rounded border ${sig.cls}">${sig.icon} ${sig.label}</span>`
                                    : '<span class="text-[10px] text-gray-400">追蹤中</span>';
                                const peRatio = s.pe_ratio;
                                const peColor = peRatio < 15 ? 'text-green-500' : peRatio < 25 ? 'text-gray-600 dark:text-gray-300' : 'text-orange-500';
                                const peStr = peRatio ? peRatio.toFixed(1) : '--';
                                return stockMobileCardHTML({
                                    symbol: s.stock_id,
                                    name: s.name || s.stock_id,
                                    badgeHTML: `<span class="stock-list-signal-stack">${signalBadge}${entryBadge}</span>`,
                                    primaryHTML: `<div class="${retClass}"><div class="font-bold">${retStr}</div><div class="text-[10px]">區間損益</div></div>`,
                                    quoteHTML: `<div class="${quote.valueClass}"><div class="font-bold">${quote.priceText}</div><div class="text-[10px]">${quote.changeText}</div></div>`,
                                    metricsHTML: stockMetricHTML('開始日', s.start_date ? s.start_date.substring(5) : '--') +
                                        stockMetricHTML('天數', `${s.tracking_days}d`) +
                                        stockMetricHTML('累計買超', buyStr, { valueClass: 'text-blue-500' }) +
                                        stockMetricHTML('法人流', flowSparkline) +
                                        stockMetricHTML('象限', quadrantBadge) +
                                        stockMetricHTML('本益比', peStr, { valueClass: peColor }),
                                    valuation: fairValue,
                                    detailHTML: s.note ? `<span class="text-orange-500">${s.note}</span>` : '',
                                    onClick: `window.StockDetail.show('${s.stock_id}')`
                                });
                            }).join('')}
                        </div>
                        <div class="overflow-x-auto hidden md:block">
                            <table class="w-full text-left stock-list-table">
                                <thead class="bg-gray-50/50 dark:bg-gray-900/50 text-gray-400 text-[10px] uppercase">
                                    <tr>
                                        <th class="px-5 py-2">股票</th>
                                        <th class="px-5 py-2 text-right">現價</th>
                                        <th class="px-5 py-2 text-right">漲跌幅</th>
                                        <th class="px-5 py-2 text-left">備註</th>
                                        <th class="px-5 py-2 text-right">開始日</th>
                                        <th class="px-5 py-2 text-right">天數</th>
                                        <th class="px-5 py-2 text-right">累計買超(張)</th>
                                        <th class="px-5 py-2 text-center">法人流</th>
                                        <th class="px-5 py-2 text-center">象限</th>
                                        <th class="px-5 py-2 text-right">區間損益</th>
                                         <th class="px-5 py-2 text-right">本益比</th>
                                        <th class="px-5 py-2 text-right">公允價</th>
                                        <th class="px-5 py-2 text-right">訊號</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-gray-100 dark:divide-gray-800 font-mono text-xs">
                                    ${sector.stocks.map(s => {
                                        const fairValue = fairValueMap[s.stock_id];
                                        const quote = formatStockQuote(quoteMap[s.stock_id]);
                                        const quadrantBadge = renderQuadrantBadge(getQuadrantInfo(rotationContext, sector.sector_tag));
                                        const flowSparkline = renderFlowSparkline(s.daily_inst_flow, 'blue');
                                        const ret = s.current_return || 0;
                                        const retStr = (ret >= 0 ? '+' : '') + (ret * 100).toFixed(1) + '%';
                                        const retClass = ret >= 0 ? 'text-red-500' : 'text-green-500';
                                        const buyStr = s.accumulated_inst_buy >= 1000
                                            ? (s.accumulated_inst_buy / 1000).toFixed(1) + 'K'
                                            : s.accumulated_inst_buy.toLocaleString();
                                        const signalConfig = {
                                            'B': { icon: '🔴', label: 'B 發動', cls: 'bg-red-500/15 text-red-500 border-red-500/30' },
                                            'A+': { icon: '🟠', label: 'A+ 起跑', cls: 'bg-orange-500/15 text-orange-500 border-orange-500/30' },
                                            'A': { icon: '🔵', label: 'A 潛伏', cls: 'bg-blue-500/15 text-blue-500 border-blue-500/30' },
                                            'ABS': { icon: '🟣', label: 'ABS 絕對買超', cls: 'bg-purple-500/15 text-purple-500 border-purple-500/30' },
                                        };
                                        const sig = signalConfig[s.latest_signal_code];
                                        const entrySig = signalConfig[s.entry_signal_code];
                                        const entryBadge = entrySig
                                            ? `<span class="text-[9px] font-bold px-1.5 py-0.5 rounded border ${entrySig.cls}">進場 ${entrySig.label}</span>`
                                            : '';
                                        const signalBadge = sig
                                            ? `<span class="text-[11px] font-bold px-2 py-1 rounded border ${sig.cls}">${sig.icon} ${sig.label}</span>`
                                            : '<span class="text-[10px] text-gray-400">追蹤中</span>';
                                        const peRatio = s.pe_ratio;
                                        const peColor = peRatio < 15 ? 'text-green-500' : peRatio < 25 ? 'text-gray-600 dark:text-gray-300' : 'text-orange-500';
                                        const peStr = peRatio ? peRatio.toFixed(1) : '--';
                                        return `<tr class="hover:bg-gray-50 dark:hover:bg-gray-800/20 cursor-pointer transition-colors"
                                                     onclick="window.StockDetail.show('${s.stock_id}')">
                                            <td class="px-5 py-2.5">${stockIdentityHTML(s.stock_id, s.name || s.stock_id)}</td>
                                            <td class="px-5 py-2.5 text-right font-bold ${quote.valueClass}">${quote.priceText}</td>
                                            <td class="px-5 py-2.5 text-right font-bold ${quote.valueClass}">${quote.changeText}</td>
                                            <td class="px-5 py-2.5 text-left">
                                                ${s.note ? `<span class="text-[10px] text-orange-500 leading-tight">${s.note}</span>` : '<span class="text-[10px] text-gray-400">--</span>'}
                                            </td>
                                            <td class="px-5 py-2.5 text-right text-gray-500 whitespace-nowrap">${s.start_date ? s.start_date.substring(5) : '--'}</td>
                                            <td class="px-5 py-2.5 text-right text-gray-500">${s.tracking_days}d</td>
                                            <td class="px-5 py-2.5 text-right font-bold text-blue-500">${buyStr}</td>
                                            <td class="px-5 py-2.5 text-center">${flowSparkline}</td>
                                            <td class="px-5 py-2.5 text-center">${quadrantBadge}</td>
                                            <td class="px-5 py-2.5 text-right font-bold ${retClass}">${retStr}</td>
                                             <td class="px-5 py-2.5 text-right font-bold ${peColor}">${peStr}</td>
                                            <td class="px-5 py-2.5 text-right">${fairValueHTML(fairValue)}</td>
                                            <td class="px-5 py-2.5 text-right">
                                                <div class="flex flex-wrap justify-end gap-1 stock-list-signal-stack">
                                                    ${signalBadge}
                                                    ${entryBadge}
                                                </div>
                                            </td>
                                        </tr>`;
                                    }).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                `).join('');
                StockListPreferences.applyAll();

                // 📡 訊號規則說明
                const signalRulesHtml = `
                    <div class="bg-white dark:bg-[#161b22] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
                        <details>
                            <summary class="px-5 py-3 text-xs font-bold text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 cursor-pointer select-none flex items-center">
                                📡 法人訊號規則說明
                                <svg class="ml-2 w-3 h-3 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                            </summary>
                            <div class="px-5 pb-5 text-[11px] text-gray-600 dark:text-gray-400 leading-relaxed space-y-3">
                                <div class="p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
                                    <div class="font-bold text-blue-600 dark:text-blue-400">🔵 A 低檔潛伏建倉</div>
                                    <div class="mt-1 pl-2 border-l-2 border-blue-400/30 space-y-1 text-[10px]">
                                        <div>① 20 日價格區間：大型股 &lt; 12%｜小型股 &lt; 20%（橫盤整理）</div>
                                        <div>② 距 MA60：大型股 ≤ 10%｜小型股 ≤ 12%（貼近均線）</div>
                                        <div>③ 20 日法人籌碼集中度 &gt; 3%（法人默默吃貨）</div>
                                        <div>④ 融資增幅：小於 500 張或 &lt; 2%（散戶沒上車）</div>
                                        <div>⑤ 借券增幅 &lt; 0.5%（沒人放空）</div>
                                        <div class="text-gray-400 mt-1">→ 五條件全成立才觸發，用於進入追蹤</div>
                                    </div>
                                </div>
                                <div class="p-3 rounded-lg bg-orange-500/5 border border-orange-500/20">
                                    <div class="font-bold text-orange-600 dark:text-orange-400">🟠 A+ 起跑試探</div>
                                    <div class="mt-1 pl-2 border-l-2 border-orange-400/30 space-y-1 text-[10px]">
                                        <div>① 近 10 天內出現過 A 訊號</div>
                                        <div>② 量比 0.8~3.0（溫和放量）</div>
                                        <div>③ 漲幅 -0.5%~5.0%（小漲不追高）</div>
                                        <div>④ 收盤 &gt; MA5（短線轉強）</div>
                                        <div>⑤ 均線糾結：MA5-MA10 差距 &lt; 5% 且 MA10-MA20 差距 &lt; 5%</div>
                                    </div>
                                </div>
                                <div class="p-3 rounded-lg bg-red-500/5 border border-red-500/20">
                                    <div class="font-bold text-red-600 dark:text-red-400">🔴 B 突發攻擊</div>
                                    <div class="mt-1 pl-2 border-l-2 border-red-400/30 space-y-1 text-[10px]">
                                        <div>① 量比 &gt; 2.2（爆量）</div>
                                        <div>② 漲幅 &gt; 3.5%（長紅）</div>
                                        <div>③ 收盤 &gt; MA20（中期趨勢轉多）</div>
                                        <div>④ 近 15 日法人籌碼集中度 &gt; 3%（法人撐腰）</div>
                                    </div>
                                </div>
                                <div class="p-3 rounded-lg bg-purple-500/5 border border-purple-500/20">
                                    <div class="font-bold text-purple-600 dark:text-purple-400">🟣 ABS 絕對買超</div>
                                    <div class="mt-1 pl-2 border-l-2 border-purple-400/30 space-y-1 text-[10px]">
                                        <div>① 20 日法人累計買超 &gt; 10 萬張（大型股）或 3 萬張（小型股）</div>
                                        <div>② 法人籌碼集中度 &gt; 1.2%（比 A 訊號寬鬆）</div>
                                        <div>③ 不受價格區間 / MA60 距離限制（巨型權值股專用）</div>
                                        <div class="text-gray-400 mt-1">→ 可進入追蹤，停損放寬至 -5%（A 是 -3%）</div>
                                    </div>
                                </div>
                            </div>
                        </details>
                    </div>
                `;
                if (sectorsContainer) sectorsContainer.insertAdjacentHTML('beforeend', signalRulesHtml);

            } catch (err) {
                console.error('法人建倉 loading error:', err);
                if (emptyContainer) {
                    emptyContainer.innerHTML = '<div class="text-center py-12 text-red-500 text-sm">數據載入失敗: ' + err.message + '</div>';
                }
            }
            return;
        }

        if (subPage === '短期快篩') {
            const listContainer = document.getElementById('rapid-screen-list');
            const emptyContainer = document.getElementById('rapid-screen-empty');
            const summaryEl = document.getElementById('rapid-screen-summary');
            if (!listContainer) return;

            try {
                const data = await api.fetchLocalJson('quant/rapid_screen.json');
                const rotationData = await api.fetchLocalJson('quant/theme_rotation.json').catch(() => null);
                const fairValueMap = await api.fetchFairValueMap().catch(() => ({}));
                const quoteMap = await api.fetchQuotes((data?.stocks || []).map(stock => stock.stock_id)).catch(() => ({}));
                const rotationContext = buildThemeRotationContext(rotationData);
                if (!data || !data.stocks || data.stocks.length === 0) {
                    if (emptyContainer) emptyContainer.innerHTML = '<div class="text-center py-12 text-gray-500">目前無符合短期快篩條件的標的</div>';
                    return;
                }

                if (emptyContainer) emptyContainer.style.display = 'none';

                if (summaryEl) {
                    summaryEl.classList.remove('hidden');
                    summaryEl.innerHTML = `
                        <div class="bg-gradient-to-r from-cyan-600/10 to-blue-600/10 rounded-2xl border border-cyan-500/20 p-4 flex items-center justify-between">
                            <div>
                                <span class="text-sm font-bold text-gray-900 dark:text-white">📡 法人積極買進 AI 股</span>
                                <span class="ml-2 text-xs text-gray-500">${data.stocks.length} 檔個股 · ${data.window_days} 日窗口</span>
                            </div>
                            <span class="text-xs text-gray-400 font-mono">${data.date}</span>
                        </div>
                    `;
                }

                listContainer.innerHTML = `
                    <div class="bg-white dark:bg-[#161b22] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
                        <div class="md:hidden divide-y divide-gray-100 dark:divide-gray-800">
                    ${data.stocks.map(s => {
                                const fairValue = fairValueMap[s.stock_id];
                                const quote = formatStockQuote(quoteMap[s.stock_id]);
                                const quadrantBadge = renderQuadrantBadge(getQuadrantInfo(rotationContext, s.sector_tag));
                                const flowSparkline = renderFlowSparkline(s.daily_inst_flow, 'cyan');
                                const buyStr = s.total_inst_buy >= 1000
                                    ? (s.total_inst_buy / 1000).toFixed(1) + 'K'
                                    : s.total_inst_buy.toLocaleString();
                                const avgStr = s.avg_daily_buy >= 1000
                                    ? (s.avg_daily_buy / 1000).toFixed(1) + 'K'
                                    : s.avg_daily_buy.toLocaleString();
                                const r3Str = s.recent_3d_buy >= 1000
                                    ? (s.recent_3d_buy / 1000).toFixed(1) + 'K'
                                    : s.recent_3d_buy.toLocaleString();
                                let labelColor = 'bg-gray-500/15 text-gray-500 border-gray-500/30';
                                if (s.label.includes('🔥')) labelColor = 'bg-red-500/15 text-red-500 border-red-500/30';
                                else if (s.label.includes('👀')) labelColor = 'bg-orange-500/15 text-orange-500 border-orange-500/30';
                                else if (s.label.includes('⚡')) labelColor = 'bg-blue-500/15 text-blue-500 border-blue-500/30';
                                const peRatio = s.pe_ratio;
                                const peColor = peRatio < 15 ? 'text-green-500' : peRatio < 25 ? 'text-gray-600 dark:text-gray-300' : 'text-orange-500';
                                const peStr = peRatio ? peRatio.toFixed(1) : '--';
                                return stockMobileCardHTML({
                                    symbol: s.stock_id,
                                    name: s.name || s.stock_id,
                                    badgeHTML: `<span class="text-[10px] font-bold px-2 py-1 rounded border ${labelColor}">${s.label}</span>`,
                                    primaryHTML: `<div class="text-cyan-600 dark:text-cyan-400"><div class="font-bold">${buyStr}</div><div class="text-[10px]">累計買超</div></div>`,
                                    quoteHTML: `<div class="${quote.valueClass}"><div class="font-bold">${quote.priceText}</div><div class="text-[10px]">${quote.changeText}</div></div>`,
                                    metricsHTML: stockMetricHTML(`買入/${data.window_days}`, `${s.buy_days}/${s.total_days || data.window_days}`) +
                                        stockMetricHTML('一致性', `${(s.consistency * 100).toFixed(0)}%`, {
                                            valueClass: s.consistency >= 0.8 ? 'text-green-500' : s.consistency >= 0.6 ? 'text-orange-500' : 'text-gray-500'
                                        }) +
                                        stockMetricHTML('法人流', flowSparkline) +
                                        stockMetricHTML('象限', quadrantBadge) +
                                        stockMetricHTML('日均買超', avgStr) +
                                        stockMetricHTML('近3日', r3Str) +
                                        stockMetricHTML('本益比', peStr, { valueClass: peColor }),
                                    valuation: fairValue,
                                    detailHTML: s.sector_tag || '',
                                    onClick: `window.StockDetail.show('${s.stock_id}')`
                                });
                            }).join('')}
                        </div>
                        <div class="overflow-x-auto hidden md:block">
                            <table class="w-full text-left stock-list-table">
                                <thead class="bg-gray-50/50 dark:bg-gray-900/50 text-gray-400 text-[10px] uppercase">
                                    <tr>
                                        <th class="px-4 py-2">股票</th>
                                        <th class="px-4 py-2 text-right">現價</th>
                                        <th class="px-4 py-2 text-right">漲跌幅</th>
                                        <th class="px-4 py-2 text-left">產業</th>
                                        <th class="px-4 py-2 text-right">累計買超</th>
                                        <th class="px-4 py-2 text-center">法人流</th>
                                        <th class="px-4 py-2 text-center">象限</th>
                                        <th class="px-4 py-2 text-right">買入/${data.window_days}</th>
                                         <th class="px-4 py-2 text-right">一致性</th>
                                         <th class="px-4 py-2 text-right">日均買超</th>
                                         <th class="px-4 py-2 text-right">近3日</th>
                                         <th class="px-4 py-2 text-right">本益比</th>
                                        <th class="px-4 py-2 text-right">公允價</th>
                                        <th class="px-4 py-2 text-right">訊號</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-gray-100 dark:divide-gray-800 font-mono text-xs">
                                    ${data.stocks.map(s => {
                                        const fairValue = fairValueMap[s.stock_id];
                                        const quote = formatStockQuote(quoteMap[s.stock_id]);
                                        const quadrantBadge = renderQuadrantBadge(getQuadrantInfo(rotationContext, s.sector_tag));
                                        const flowSparkline = renderFlowSparkline(s.daily_inst_flow, 'cyan');
                                        const buyStr = s.total_inst_buy >= 1000
                                            ? (s.total_inst_buy / 1000).toFixed(1) + 'K'
                                            : s.total_inst_buy.toLocaleString();
                                        const avgStr = s.avg_daily_buy >= 1000
                                            ? (s.avg_daily_buy / 1000).toFixed(1) + 'K'
                                            : s.avg_daily_buy.toLocaleString();
                                        const r3Str = s.recent_3d_buy >= 1000
                                            ? (s.recent_3d_buy / 1000).toFixed(1) + 'K'
                                            : s.recent_3d_buy.toLocaleString();

                                        let labelColor = 'bg-gray-500/15 text-gray-500 border-gray-500/30';
                                        if (s.label.includes('🔥')) labelColor = 'bg-red-500/15 text-red-500 border-red-500/30';
                                        else if (s.label.includes('👀')) labelColor = 'bg-orange-500/15 text-orange-500 border-orange-500/30';
                                        else if (s.label.includes('⚡')) labelColor = 'bg-blue-500/15 text-blue-500 border-blue-500/30';
                                        const peRatio = s.pe_ratio;
                                        const peColor = peRatio < 15 ? 'text-green-500' : peRatio < 25 ? 'text-gray-600 dark:text-gray-300' : 'text-orange-500';
                                        const peStr = peRatio ? peRatio.toFixed(1) : '--';

                                        return `<tr class="hover:bg-gray-50 dark:hover:bg-gray-800/20 cursor-pointer transition-colors"
                                                     onclick="window.StockDetail.show('${s.stock_id}')">
                                            <td class="px-4 py-2.5">${stockIdentityHTML(s.stock_id, s.name || s.stock_id)}</td>
                                            <td class="px-4 py-2.5 text-right font-bold ${quote.valueClass}">${quote.priceText}</td>
                                            <td class="px-4 py-2.5 text-right font-bold ${quote.valueClass}">${quote.changeText}</td>
                                            <td class="px-4 py-2.5 text-left text-gray-500 text-[10px]">${s.sector_tag || '--'}</td>
                                            <td class="px-4 py-2.5 text-right font-bold text-cyan-600 dark:text-cyan-400">${buyStr}</td>
                                            <td class="px-4 py-2.5 text-center">${flowSparkline}</td>
                                            <td class="px-4 py-2.5 text-center">${quadrantBadge}</td>
                                            <td class="px-4 py-2.5 text-right text-gray-600 dark:text-gray-300">${s.buy_days}/${s.total_days || data.window_days}</td>
                                             <td class="px-4 py-2.5 text-right">
                                                 <span class="${s.consistency >= 0.8 ? 'text-green-500' : s.consistency >= 0.6 ? 'text-orange-500' : 'text-gray-500'}">${(s.consistency * 100).toFixed(0)}%</span>
                                             </td>
                                             <td class="px-4 py-2.5 text-right text-gray-500">${avgStr}</td>
                                             <td class="px-4 py-2.5 text-right text-gray-500">${r3Str}</td>
                                             <td class="px-4 py-2.5 text-right font-bold ${peColor}">${peStr}</td>
                                            <td class="px-4 py-2.5 text-right">${fairValueHTML(fairValue)}</td>
                                            <td class="px-4 py-2.5 text-right">
                                                <span class="text-[10px] font-bold px-2 py-1 rounded border ${labelColor}">${s.label}</span>
                                            </td>
                                        </tr>`;
                                    }).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                `;
                StockListPreferences.applyAll();
            } catch (err) {
                console.error('短期快篩 loading error:', err);
                if (emptyContainer) {
                    emptyContainer.innerHTML = '<div class="text-center py-12 text-red-500 text-sm">數據載入失敗: ' + err.message + '</div>';
                }
            }
            return;
        }

        if (subPage === '族群本益比') {
            const listContainer = document.getElementById('sector-pe-list');
            const emptyContainer = document.getElementById('sector-pe-empty');
            if (!listContainer) return;

            try {
                const data = await api.fetchLocalJson('quant/sector_pe.json');
                const fairValueMap = await api.fetchFairValueMap().catch(() => ({}));
                const quoteMap = await api.fetchQuotes([...new Set((data?.sectors || []).flatMap(sector => (sector.stocks || []).map(stock => stock.stock_id)))]).catch(() => ({}));
                if (!data || !data.sectors || data.sectors.length === 0) {
                    if (emptyContainer) emptyContainer.innerHTML = '<div class="text-center py-12 text-gray-500">暫無本益比數據</div>';
                    return;
                }

                if (emptyContainer) emptyContainer.style.display = 'none';

                listContainer.innerHTML = data.sectors.map(sector => `
                    <div class="bg-white dark:bg-[#161b22] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
                        <div class="px-5 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors sector-accordion-header"
                             onclick="this.nextElementSibling.classList.toggle('hidden'); this.querySelector('.chevron').classList.toggle('rotate-180')">
                            <div class="flex items-center space-x-3">
                                <div>
                                    <div class="font-bold text-gray-900 dark:text-white text-sm">${sector.display_tag || sector.sector_tag}</div>
                                    <div class="text-xs text-gray-400">${sector.stock_count} 檔 · 中位數 PE: ${sector.median_pe || '--'}</div>
                                </div>
                            </div>
                            <div class="flex items-center space-x-3">
                                <span class="text-xs text-gray-400 font-mono">${sector.stock_count} 檔</span>
                                <svg class="chevron w-4 h-4 text-gray-400 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                                </svg>
                            </div>
                        </div>
                        <div class="md:hidden divide-y divide-gray-100 dark:divide-gray-800">
                            ${sector.stocks.map(s => {
                                const fairValue = fairValueMap[s.stock_id];
                                const quote = formatStockQuote(quoteMap[s.stock_id]);
                                const peStr = s.pe_ratio !== null ? s.pe_ratio.toFixed(1) : '--';
                                const epsStr = s.eps !== null ? s.eps.toFixed(2) : '--';
                                const labelColor = s.label?.includes('🔵') ? 'text-blue-500' : s.label?.includes('🔴') ? 'text-red-500' : 'text-gray-500';
                                return stockMobileCardHTML({
                                    symbol: s.stock_id,
                                    name: s.name || s.stock_id,
                                    primaryHTML: '',
                                    quoteHTML: `<div class="${quote.valueClass}"><div class="font-bold">${quote.priceText}</div><div class="text-[10px]">${quote.changeText}</div></div>`,
                                    valuation: fairValue,
                                    metricsHTML: stockMetricHTML('EPS', epsStr) + stockMetricHTML('本益比', peStr, { valueClass: labelColor }),
                                    detailHTML: `<span class="${labelColor}">${s.label || '--'}</span>`,
                                    onClick: `window.StockDetail.show('${s.stock_id}')`
                                });
                            }).join('')}
                        </div>
                        <div class="overflow-x-auto hidden md:block">
                            <table class="w-full text-left stock-list-table">
                                <thead class="bg-gray-50/50 dark:bg-gray-900/50 text-gray-400 text-[10px] uppercase">
                                    <tr>
                                        <th class="px-4 py-2">股票</th>
                                        <th class="px-4 py-2 text-right">現價</th>
                                        <th class="px-4 py-2 text-right">漲跌幅</th>
                                        <th class="px-4 py-2 text-right">EPS</th>
                                        <th class="px-4 py-2 text-right">本益比</th>
                                        <th class="px-4 py-2 text-right">公允價</th>
                                        <th class="px-4 py-2 text-right">評價</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-gray-100 dark:divide-gray-800 font-mono text-xs">
                                    ${sector.stocks.map(s => {
                                        const peStr = s.pe_ratio !== null ? s.pe_ratio.toFixed(1) : '--';
                                        const fairValue = fairValueMap[s.stock_id];
                                        const quote = formatStockQuote(quoteMap[s.stock_id]);
                                        let labelColor = 'text-gray-500';
                                        if (s.label.includes('🔵')) labelColor = 'text-blue-500';
                                        else if (s.label.includes('🔴')) labelColor = 'text-red-500';
                                        else if (s.label.includes('虧損')) labelColor = 'text-gray-400';
                                        const epsStr = s.eps !== null ? s.eps.toFixed(2) : '--';
                                        return `<tr class="hover:bg-gray-50 dark:hover:bg-gray-800/20 cursor-pointer transition-colors"
                                                     onclick="window.StockDetail.show('${s.stock_id}')">
                                            <td class="px-4 py-2.5">${stockIdentityHTML(s.stock_id, s.name || s.stock_id)}</td>
                                            <td class="px-4 py-2.5 text-right font-bold ${quote.valueClass}">${quote.priceText}</td>
                                            <td class="px-4 py-2.5 text-right font-bold ${quote.valueClass}">${quote.changeText}</td>
                                            <td class="px-4 py-2.5 text-right text-gray-500">${epsStr}</td>
                                            <td class="px-4 py-2.5 text-right font-bold ${s.pe_ratio !== null ? (s.pe_ratio < 15 ? 'text-green-500' : s.pe_ratio > 30 ? 'text-red-500' : 'text-gray-900 dark:text-white') : 'text-gray-400'}">${peStr}</td>
                                            <td class="px-4 py-2.5 text-right">${fairValueHTML(fairValue)}</td>
                                            <td class="px-4 py-2.5 text-right"><span class="text-[10px] font-bold ${labelColor}">${s.label}</span></td>
                                        </tr>`;
                                    }).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                `).join('');
                StockListPreferences.applyAll();
            } catch (err) {
                console.error('族群本益比 loading error:', err);
                if (emptyContainer) {
                    emptyContainer.innerHTML = '<div class="text-center py-12 text-red-500 text-sm">數據載入失敗: ' + err.message + '</div>';
                }
            }
            return;
        }

        if (subPage === '資金輪動') {
            const container = document.getElementById('trend-chart-container');
            if (!container) return;

            try {
                const rotationData = await api.fetchLocalJson('quant/theme_rotation.json');

                if (!rotationData.themes || rotationData.themes.length === 0) {
                    container.innerHTML = `<div class="text-center text-gray-500 py-8">無資金輪動數據</div>`;
                    return;
                }

                container.innerHTML = ''; // 清空 loading
                const isDark = document.documentElement.classList.contains('dark');
                const textSec = isDark ? '#aaa' : '#666';
                const isMobile = window.innerWidth < 768;

                function getHeatColor(pct) {
                    if (pct > 2.0) return '#cc1919';
                    if (pct > 0) return '#ff4d4d';
                    if (pct < -2.0) return '#1a991a';
                    if (pct < 0) return '#4de64d';
                    return isDark ? '#555' : '#999';
                }

                // === 1. 🚀 v10.7: Regime Banner (市場環境感測) ===
                const regime = rotationData.regime || '';
                const isAggressive = regime === 'AGGRESSIVE';
                const badgeColor = isAggressive ? '#ef4444' : '#3b82f6';
                const descText = isAggressive
                    ? '當前為【積極進攻】模式，資金集中在強勢成長股，建議提高 Beta 曝險。'
                    : (regime === 'CAUTIOUS' ? '當前為【謹慎觀察】模式，短線動能減弱，建議降低 Beta 曝險。' : '當前為【保守防禦】模式，建議關注高股息或防禦型板塊。');
                const bannerHtml = `
                    <div class="mb-3 p-3 rounded-xl" style="background:${isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'}">
                        <div class="flex items-center gap-2 mb-1">
                            <span class="text-sm">📡 市場環境感測</span>
                            <span class="text-xs font-bold px-2 py-0.5 rounded-md text-white" style="background:${badgeColor}">${regime || '--'}</span>
                        </div>
                        <div class="text-xs" style="color:${textSec}">${descText}</div>
                    </div>
                `;
                container.insertAdjacentHTML('beforeend', bannerHtml);

                const longTermDom = document.createElement('div');
                longTermDom.innerHTML = `
                    <div class="mt-3 mb-4 p-4 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-500" style="background:${isDark ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.025)'}">
                        長期資金主線載入中...
                    </div>
                `;
                container.appendChild(longTermDom);

                (async () => {
                    try {
                        const flowIndex = await api.fetchLocalJson('quant/sector_monthly_flow/index.json');
                        const themes = flowIndex?.themes || [];
                        const mandatoryThemes = [
                            'Financials', 'Transportation', 'Real Estate', 'Materials', 'Consumer',
                            'Semiconductor', 'AI_Ecosystem', 'Energy', '航運業', '金融保險業',
                            '建材營造業', '食品工業', '塑膠工業', '觀光餐旅', '紡織纖維',
                            '鋼鐵工業', '綠能環保'
                        ];
                        const topRotation = (rotationData.themes || []).slice(0, 45).map(t => t.name);
                        const candidateThemes = [...new Set([...mandatoryThemes, ...topRotation])]
                            .filter(name => themes.includes(name));
                        const results = await Promise.allSettled(candidateThemes.map(async themeName => {
                            const safeName = encodeURIComponent(themeName);
                            const data = await api.fetchLocalJson(`quant/sector_monthly_flow/${safeName}.json`);
                            return computeMonthlyStrength(data);
                        }));
                        const items = dedupeStrengthItems(results
                            .filter(r => r.status === 'fulfilled' && r.value)
                            .map(r => r.value))
                            .sort((a, b) => b.score - a.score);
                        longTermDom.innerHTML = renderLongTermStrengthSection(items, textSec, isDark);
                    } catch (err) {
                        console.warn('long-term strength loading failed:', err);
                        longTermDom.innerHTML = `
                            <div class="mt-3 mb-4 p-4 rounded-xl border border-amber-300/40 text-sm text-amber-600">
                                長期資金主線暫時無法載入
                            </div>
                        `;
                    }
                })();

                // === 2. 🚀 v10.7: 族群資金輪動熱力圖 (Treemap) ===
                const treemapHtml = `
                    <div class="mb-2 flex items-center gap-2">
                        <span class="text-xs font-bold">🔥 族群資金輪動熱力圖</span>
                        <span class="text-xs" style="color:${textSec}">面積代表成交值佔比，顏色代表平均漲跌幅，可切換官方產業與題材層級</span>
                    </div>
                `;
                container.insertAdjacentHTML('beforeend', treemapHtml);
                const treemapDom = document.createElement('div');
                treemapDom.style.width = '100%';
                treemapDom.style.height = isMobile ? '220px' : '260px';
                treemapDom.style.marginBottom = '12px';
                container.appendChild(treemapDom);

                // === 3. 產業/AI 主題切換開關 + 象限圖 ===
                const toggleHtml = `
                    <div class="flex flex-wrap bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5 mb-2 gap-0.5" style="width:fit-content">
                        <button class="view-toggle px-3 py-1 text-xs rounded-md font-bold bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm" data-view="all">全部</button>
                        <button class="view-toggle px-3 py-1 text-xs rounded-md text-gray-500 dark:text-gray-400" data-view="official">官方產業</button>
                        <button class="view-toggle px-3 py-1 text-xs rounded-md text-gray-500 dark:text-gray-400" data-view="macro">大板塊</button>
                        <button class="view-toggle px-3 py-1 text-xs rounded-md text-gray-500 dark:text-gray-400" data-view="ai">AI題材</button>
                        <button class="view-toggle px-3 py-1 text-xs rounded-md text-gray-500 dark:text-gray-400" data-view="old">舊經濟</button>
                    </div>
                `;
                container.insertAdjacentHTML('beforeend', toggleHtml);

                const chartDom = document.createElement('div');
                chartDom.style.width = '100%';
                chartDom.style.height = isMobile ? '320px' : '400px';
                container.appendChild(chartDom);

                if (isMobile) {
                    const legendHtml = `
                        <div class="grid grid-cols-2 gap-x-3 gap-y-1 mt-2 px-1 text-[10px]">
                            <span style="color:#ef4444">🔥 量價齊揚 (主流)</span>
                            <span style="color:#3b82f6">💧 資金吸納 (低接)</span>
                            <span style="color:#f59e0b">🔒 籌碼鎖定 (悶聲)</span>
                            <span style="color:#10b981">❄️ 弱勢量縮 (觀望)</span>
                        </div>
                    `;
                    container.insertAdjacentHTML('beforeend', legendHtml);
                }

                setTimeout(() => {
                    if (!container.contains(chartDom)) return;

                    // Treemap
                    const treemapChart = echarts.init(treemapDom, isDark ? 'dark' : null);

                    function buildTreemapOption(data) {
                        const sorted = [...data].sort((a, b) => (b.flow_ratio || 0) - (a.flow_ratio || 0));
                        return {
                            backgroundColor: 'transparent',
                            tooltip: {
                                formatter: function(p) {
                                    const d = p.data;
                                    const pct = (d._avgPct || 0);
                                    const pctStr = pct > 0 ? `+${pct.toFixed(1)}%` : `${pct.toFixed(1)}%`;
                                    return `<b>${d.name}</b><br/>成交佔比: ${(d._flowRatio || 0).toFixed(1)}%<br/>平均漲跌幅: ${pctStr}<br/><span style="font-size:11px;color:#94a3b8">點擊查看個股列表</span>`;
                                }
                            },
                            series: [{
                                type: 'treemap',
                                roam: false,
                                width: '100%',
                                height: '100%',
                                breadcrumb: { show: false },
                                label: {
                                    show: true,
                                    fontSize: isMobile ? 8 : 10,
                                    color: '#fff',
                                    fontWeight: 'bold',
                                    textShadowBlur: 2,
                                    textShadowColor: 'rgba(0,0,0,0.5)',
                                    formatter: params => canonicalGroupName(params.name)
                                },
                                itemStyle: {
                                    borderColor: isDark ? '#333' : '#fff',
                                    borderWidth: 2
                                },
                                levels: [{
                                    colorSaturation: [0.3, 0.6],
                                    itemStyle: {
                                        borderColor: isDark ? '#333' : '#fff',
                                        borderWidth: 2,
                                        gapWidth: 2
                                    }
                                }],
                                data: sorted.map(t => ({
                                    name: canonicalGroupName(t.name),
                                    value: Math.max(t.flow_ratio || 1, 0.5),
                                    _flowRatio: t.flow_ratio,
                                    _avgPct: t.avg_pct,
                                    itemStyle: { color: getHeatColor(t.avg_pct || 0) }
                                }))
                            }]
                        };
                    }

                    treemapChart.setOption(buildTreemapOption(getRotationViewData(rotationData, 'all')));
                    treemapChart.on('click', params => openGroupList(params?.data?.name || params?.name));
                    treemapChart.resize();

                    // Scatter chart (象限圖)
                    const myChart = echarts.init(chartDom, isDark ? 'dark' : null);

                    function getActiveData(view) {
                        return getRotationViewData(rotationData, view);
                    }

                    function buildOption(data) {
                        if (!data.length) {
                            data = [{ name: '無資料', net_flow: 0, avg_pct: 0, trend: 'FLAT', flow_ratio: 1 }];
                        }
                        const netFlows = data.map(t => t.net_flow || 0);
                        const bound = Math.max(...netFlows.map(Math.abs), 5);
                        const seriesData = data.map(t => [t.net_flow || 0, t.avg_pct, canonicalGroupName(t.name), t.trend, t.flow_ratio]);

                        return {
                            backgroundColor: 'transparent',
                            tooltip: {
                                trigger: 'item',
                                formatter: function (params) {
                                    const nf = params.value[0];
                                    const nfStr = nf >= 0 ? `+${nf.toFixed(1)}億` : `${nf.toFixed(1)}億`;
                                    return `<b>${params.value[2]}</b><br/>法人淨買超: ${nfStr}<br/>平均漲跌幅: ${params.value[1].toFixed(2)}%<br/>成交佔比: ${(params.value[4] || 0).toFixed(1)}%<br/><span style="font-size:11px;color:#94a3b8">點擊查看個股列表</span>`;
                                }
                            },
                            grid: {
                                left: isMobile ? '8%' : '12%',
                                right: isMobile ? '6%' : '10%',
                                bottom: isMobile ? '15%' : '20%',
                                top: isMobile ? '12%' : '22%',
                                containLabel: true
                            },
                            xAxis: {
                                name: '法人淨買超 (億元)',
                                nameLocation: 'middle',
                                nameGap: isMobile ? 35 : 60,
                                splitLine: { show: false },
                                axisLabel: { color: isDark ? '#888' : '#666', fontSize: isMobile ? 8 : 10 },
                                min: -bound - 2,
                                max: bound + 2
                            },
                            yAxis: {
                                name: '平均漲跌幅 (%)',
                                nameLocation: 'end',
                                nameGap: isMobile ? 25 : 35,
                                splitLine: {
                                    show: true,
                                    lineStyle: { color: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }
                                },
                                axisLabel: { color: isDark ? '#888' : '#666', fontSize: isMobile ? 8 : 10 },
                                min: function(value) {
                                    const absMax = Math.max(Math.abs(value.min), Math.abs(value.max), 3);
                                    return -absMax - 0.5;
                                },
                                max: function(value) {
                                    const absMax = Math.max(Math.abs(value.min), Math.abs(value.max), 3);
                                    return absMax + 0.5;
                                }
                            },
                            graphic: isMobile ? [] : [
                                {
                                    type: 'group',
                                    left: 'center',
                                    top: 'middle',
                                    children: [
                                        {
                                            type: 'text',
                                            right: -140,
                                            top: -210,
                                            style: {
                                                text: '🔥 量價齊揚 (主流)',
                                                font: 'bold 13px sans-serif',
                                                fill: '#ef4444',
                                                textAlign: 'center'
                                            }
                                        },
                                        {
                                            type: 'text',
                                            right: -140,
                                            bottom: -240,
                                            style: {
                                                text: '💧 資金吸納 (低接)',
                                                font: 'bold 13px sans-serif',
                                                fill: '#3b82f6',
                                                textAlign: 'center'
                                            }
                                        },
                                        {
                                            type: 'text',
                                            left: -140,
                                            top: -210,
                                            style: {
                                                text: '🔒 籌碼鎖定 (悶聲)',
                                                font: 'bold 13px sans-serif',
                                                fill: '#f59e0b',
                                                textAlign: 'center'
                                            }
                                        },
                                        {
                                            type: 'text',
                                            left: -140,
                                            bottom: -240,
                                            style: {
                                                text: '❄️ 弱勢量縮 (觀望)',
                                                font: 'bold 13px sans-serif',
                                                fill: '#10b981',
                                                textAlign: 'center'
                                            }
                                        }
                                    ]
                                }
                            ],
                            series: [{
                                type: 'scatter',
                                data: seriesData,
                                symbolSize: function (value) {
                                    const flow = (value && value[4]) || 0;
                                    return Math.max(10, Math.min(50, flow * 1.5 + 8));
                                },
                                itemStyle: {
                                    color: function(params) {
                                        const x = params.value[0];
                                        const y = params.value[1];
                                        if (x > 0) {
                                            return y > 0 ? '#ef4444' : '#3b82f6';
                                        } else {
                                            return y > 0 ? '#f59e0b' : '#10b981';
                                        }
                                    },
                                    shadowBlur: 8,
                                    shadowColor: 'rgba(0, 0, 0, 0.15)',
                                    opacity: 0.85
                                },
                                markLine: {
                                    silent: true,
                                    lineStyle: {
                                        type: 'dashed',
                                        color: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)'
                                    },
                                    data: [
                                        { xAxis: 0, name: '零軸線', label: { position: 'start', distance: 25, color: isDark ? '#aaa' : '#666' } },
                                        { yAxis: 0, name: '平盤線', label: { position: 'end', color: isDark ? '#aaa' : '#666' } }
                                    ],
                                    label: {
                                        show: true,
                                        fontSize: isMobile ? 9 : 11,
                                        formatter: function(p) {
                                            return p.name;
                                        }
                                    }
                                }
                            }]
                        };
                    }

                    let currentView = 'all';
                    let option = buildOption(getActiveData(currentView));
                    myChart.setOption(option);
                    myChart.on('click', params => openGroupList(params?.value?.[2] || params?.name));
                    myChart.resize();
                    window.addEventListener('resize', () => {
                        treemapChart.resize();
                        myChart.resize();
                    });

                    // 切換事件 — 同步更新 treemap + scatter
                    container.querySelectorAll('.view-toggle').forEach(btn => {
                        btn.addEventListener('click', function() {
                            const view = this.dataset.view;
                            if (view === currentView) return;
                            currentView = view;
                            container.querySelectorAll('.view-toggle').forEach(b => {
                                b.className = 'view-toggle px-3 py-1 text-xs rounded-md text-gray-500 dark:text-gray-400';
                            });
                            this.className = 'view-toggle px-3 py-1 text-xs rounded-md font-bold bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm';
                            const activeData = getActiveData(view);
                            treemapChart.setOption(buildTreemapOption(activeData), true);
                            option = buildOption(activeData);
                            myChart.setOption(option, true);
                        });
                    });
                }, 50);

                // === 4. 📈 族群月曲線 (Monthly Curve) ===
                const monthlySectionHtml = `
                    <div class="mt-4 mb-2 p-4 rounded-xl border border-gray-200 dark:border-gray-700" style="background:${isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)'}">
                        <div class="flex items-center justify-between mb-3">
                            <div class="flex items-center gap-2">
                                <span class="text-sm font-bold">📈 族群月曲線</span>
                                <span class="text-xs" style="color:${textSec}">資金淨流入 vs 個股累計漲跌幅（近30日）</span>
                            </div>
                            <select id="monthly-theme-select" class="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none text-gray-800 dark:text-gray-200">
                                <option value="">載入中...</option>
                            </select>
                        </div>
                        <div id="monthly-curve-chart" style="width:100%;height:${isMobile ? '380px' : '450px'}"></div>
                        <div id="monthly-curve-checkboxes" class="mt-3 flex flex-wrap gap-2"></div>
                    </div>
                `;
                container.insertAdjacentHTML('beforeend', monthlySectionHtml);

                // 載入月曲線資料
                (async () => {
                    try {
                        const flowIndex = await api.fetchLocalJson('quant/sector_monthly_flow/index.json');
                        if (!flowIndex || !flowIndex.themes || flowIndex.themes.length === 0) return;

                        const selectEl = document.getElementById('monthly-theme-select');
                        if (!selectEl) return;
                        selectEl.innerHTML = flowIndex.themes.map((t, i) =>
                            `<option value="${t}" ${i === 0 ? 'selected' : ''}>${t}</option>`
                        ).join('');

                        let monthlyChart = null;
                        let currentThemeData = null;

                        async function loadTheme(themeName) {
                            const data = await api.fetchLocalJson(`quant/sector_monthly_flow/${encodeURIComponent(themeName)}.json`);
                            if (!data) return;
                            currentThemeData = data;
                            renderMonthlyCurve(data);
                        }

                        function renderMonthlyCurve(data) {
                            const chartDom = document.getElementById('monthly-curve-chart');
                            if (!chartDom) return;
                            if (monthlyChart) monthlyChart.dispose();
                            monthlyChart = echarts.init(chartDom, isDark ? 'dark' : null);

                            const dates = data.dates.map(d => d.substring(5)); // MM-DD
                            const netFlow = data.industry_net_flow;
                            const stocks = data.stocks_data;

                            // 計算左右 Y 軸範圍
                            const flowMax = Math.max(...netFlow.map(Math.abs), 1);
                            const allReturns = stocks.flatMap(s => s.cumulative_return);
                            const returnMax = Math.max(...allReturns.map(Math.abs), 1);

                            // 資金流系列（柱狀圖）
                            const flowSeries = {
                                name: '族群淨流入',
                                type: 'bar',
                                yAxisIndex: 0,
                                data: netFlow,
                                itemStyle: {
                                    color: function(params) {
                                        return params.value >= 0
                                            ? 'rgba(24,144,255,0.6)'
                                            : 'rgba(24,144,255,0.35)';
                                    },
                                    borderRadius: [2, 2, 0, 0]
                                },
                                barMaxWidth: 12,
                                z: 1
                            };

                            // 個股系列（預設只顯示 default_visible 的）
                            const stockSeries = stocks.map((stock, idx) => ({
                                name: `${stock.stock_name}(${stock.stock_id})`,
                                type: 'line',
                                yAxisIndex: 1,
                                data: stock.cumulative_return,
                                showSymbol: false,
                                lineStyle: { width: 1.5 },
                                emphasis: { focus: 'series' },
                                z: 2,
                                _defaultVisible: stock.default_visible
                            }));

                            // 圖例篩選
                            const legendNames = ['族群淨流入', ...stockSeries.map(s => s.name)];
                            const legendSelected = { '族群淨流入': true };
                            stockSeries.forEach(s => {
                                legendSelected[s.name] = s._defaultVisible;
                            });

                            const option = {
                                backgroundColor: 'transparent',
                                tooltip: {
                                    trigger: 'axis',
                                    axisPointer: { type: 'cross', crossStyle: { color: '#999' } },
                                    formatter: function(params) {
                                        if (!params || params.length === 0) return '';
                                        const date = params[0].axisValue;
                                        let html = `<b>${date}</b><br/>`;
                                        // 分為資金流和個股
                                        const flowP = params.find(p => p.seriesName === '族群淨流入');
                                        const stockPs = params.filter(p => p.seriesName !== '族群淨流入')
                                            .sort((a, b) => (b.value || 0) - (a.value || 0));
                                        if (flowP) {
                                            const v = flowP.value;
                                            html += `<span style="color:#1890ff">●</span> 族群淨流入: <b>${v >= 0 ? '+' : ''}${v.toFixed(1)} 億元</b><br/>`;
                                        }
                                        stockPs.forEach(p => {
                                            const v = p.value;
                                            const color = v >= 0 ? '#ef4444' : '#10b981';
                                            html += `<span style="color:${color}">●</span> ${p.seriesName}: <b>${v >= 0 ? '+' : ''}${v.toFixed(2)}%</b><br/>`;
                                        });
                                        return html;
                                    }
                                },
                                legend: {
                                    data: legendNames,
                                    selected: legendSelected,
                                    top: 0,
                                    type: 'scroll',
                                    textStyle: { fontSize: isMobile ? 9 : 11, color: isDark ? '#aaa' : '#666' }
                                },
                                grid: {
                                    left: isMobile ? '10%' : '8%',
                                    right: isMobile ? '10%' : '8%',
                                    top: '15%',
                                    bottom: isMobile ? '20%' : '14%',
                                    containLabel: true
                                },
                                xAxis: {
                                    type: 'category',
                                    data: dates,
                                    axisLabel: { fontSize: isMobile ? 8 : 10, color: isDark ? '#888' : '#666', rotate: isMobile ? 45 : 0 },
                                    axisTick: { show: false }
                                },
                                yAxis: [
                                    {
                                        type: 'value',
                                        name: '淨流入(億)',
                                        nameTextStyle: { fontSize: 10, color: isDark ? '#888' : '#666' },
                                        position: 'left',
                                        axisLabel: { fontSize: 9, color: '#1890ff', formatter: function(v) { return Math.round(v); } },
                                        splitLine: { show: true, lineStyle: { color: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' } },
                                        min: -flowMax * 1.2,
                                        max: flowMax * 1.2
                                    },
                                    {
                                        type: 'value',
                                        name: '漲跌幅(%)',
                                        nameTextStyle: { fontSize: 10, color: isDark ? '#888' : '#666' },
                                        position: 'right',
                                        axisLabel: { fontSize: 9, color: isDark ? '#aaa' : '#666', formatter: function(v) { return v.toFixed(0) + '%'; } },
                                        splitLine: { show: false },
                                        min: -returnMax * 1.2,
                                        max: returnMax * 1.2
                                    }
                                ],
                                dataZoom: [
                                    { type: 'inside', start: 0, end: 100 },
                                    { type: 'slider', height: isMobile ? 16 : 20, bottom: 4, start: 0, end: 100 }
                                ],
                                series: [flowSeries, ...stockSeries]
                            };

                            monthlyChart.setOption(option);
                            monthlyChart.resize();

                            // 渲染 Checkbox
                            renderCheckboxes(stocks, monthlyChart, legendNames, legendSelected);

                            window.addEventListener('resize', () => {
                                if (monthlyChart) monthlyChart.resize();
                            });
                        }

                        function renderCheckboxes(stocks, chart, legendNames, legendSelected) {
                            const cbContainer = document.getElementById('monthly-curve-checkboxes');
                            if (!cbContainer) return;
                            cbContainer.innerHTML = '';

                            // 族群淨流入 checkbox
                            const flowCb = createCheckbox('族群淨流入', '#1890ff', true, (checked) => {
                                chart.dispatchAction({ type: 'legendToggleSelect', name: '族群淨流入' });
                            });
                            cbContainer.appendChild(flowCb);

                            // 個股 checkboxes
                            stocks.forEach(stock => {
                                const name = `${stock.stock_name}(${stock.stock_id})`;
                                const lastRet = stock.cumulative_return[stock.cumulative_return.length - 1] || 0;
                                const color = lastRet >= 0 ? '#ef4444' : '#10b981';
                                const cb = createCheckbox(name, color, stock.default_visible, (checked) => {
                                    chart.dispatchAction({ type: 'legendToggleSelect', name });
                                });
                                cbContainer.appendChild(cb);
                            });
                        }

                        function createCheckbox(label, color, checked, onChange) {
                            const wrapper = document.createElement('label');
                            wrapper.className = 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full cursor-pointer text-xs font-bold transition-all';
                            wrapper.style.background = checked ? `${color}15` : 'transparent';
                            wrapper.style.color = checked ? color : (isDark ? '#888' : '#aaa');
                            wrapper.style.border = `1px solid ${checked ? color + '40' : 'transparent'}`;

                            const input = document.createElement('input');
                            input.type = 'checkbox';
                            input.checked = checked;
                            input.className = 'hidden';

                            const dot = document.createElement('span');
                            dot.style.width = '8px';
                            dot.style.height = '8px';
                            dot.style.borderRadius = '50%';
                            dot.style.background = checked ? color : 'transparent';
                            dot.style.border = `2px solid ${checked ? color : (isDark ? '#555' : '#ccc')}`;

                            const text = document.createTextNode(label);

                            wrapper.appendChild(input);
                            wrapper.appendChild(dot);
                            wrapper.appendChild(text);

                            wrapper.addEventListener('click', (e) => {
                                e.preventDefault();
                                input.checked = !input.checked;
                                onChange(input.checked);
                                // 更新視覺
                                wrapper.style.background = input.checked ? `${color}15` : 'transparent';
                                wrapper.style.color = input.checked ? color : (isDark ? '#888' : '#aaa');
                                wrapper.style.border = `1px solid ${input.checked ? color + '40' : 'transparent'}`;
                                dot.style.background = input.checked ? color : 'transparent';
                                dot.style.border = `2px solid ${input.checked ? color : (isDark ? '#555' : '#ccc')}`;
                            });

                            return wrapper;
                        }

                        // 切換族群
                        selectEl.addEventListener('change', (e) => {
                            if (e.target.value) loadTheme(e.target.value);
                        });

                        // 初始載入第一個族群
                        await loadTheme(flowIndex.themes[0]);

                    } catch (err) {
                        console.error('月曲線載入失敗:', err);
                    }
                })();

            } catch (err) {
                console.error(err);
                container.innerHTML = `<div class="text-center text-red-500 py-8">圖表加載失敗: ${err.message}</div>`;
            }
        }

        else if (subPage === '熱力圖') {
            const container = document.getElementById('trend-chart-container');
            if (!container) return;

            try {
                const [stocksData, indexData] = await Promise.all([
                    api.fetchLocalJson('meta/stocks.json'),
                    api.fetchLocalJson('index.json')
                ]);

                const latestDate = indexData.latest_daily_tw;
                if (!latestDate) throw new Error('No trading date found in index');

                const dailyData = await api.fetchLocalJson(`daily/tw/${latestDate}.json`);

                const stockMetaMap = {};
                if (stocksData.stocks) {
                    stocksData.stocks.forEach(s => {
                        stockMetaMap[s.symbol] = {
                            name: s.name,
                            industry: s.industry || s.official_sector || '其他',
                            sector: s.official_sector
                        };
                    });
                }

                const rawStocks = dailyData.stocks || [];
                const filtered = rawStocks
                    .filter(s => {
                        const meta = stockMetaMap[s.id];
                        if (!meta) return false;
                        return meta.sector !== 'ETF' && meta.industry !== 'ETF';
                    })
                    .sort((a, b) => (b.t || 0) - (a.t || 0))
                    .slice(0, 150);

                if (filtered.length === 0) {
                    container.innerHTML = `<div class="text-center text-gray-500 py-8">無熱力圖數據</div>`;
                    return;
                }

                // --- 🚀 v2.20.0: 自定義台股熱力圖佈局算法 (Leader Partitioning) ---
                const groups = {};
                filtered.forEach(s => {
                    const meta = stockMetaMap[s.id];
                    const ind = canonicalGroupName(meta.industry) || '其他';
                    if (!groups[ind]) groups[ind] = { name: ind, totalValue: 0, items: [] };
                    groups[ind].items.push({
                        id: s.id,
                        name: meta.name,
                        value: s.t,
                        pct: s.pct
                    });
                    groups[ind].totalValue += s.t;
                });

                const sortedSectors = Object.values(groups).sort((a, b) => b.totalValue - a.totalValue);

                function getColorByPct(pct) {
                    if (pct > 0) {
                        const ratio = Math.min(1, pct / 7.0);
                        const r = Math.round(30 + (220 - 30) * ratio);
                        const g = Math.round(41 + (38 - 41) * ratio);
                        const b = Math.round(59 + (38 - 59) * ratio);
                        return `rgb(${r}, ${g}, ${b})`;
                    } else if (pct < 0) {
                        const ratio = Math.min(1, Math.abs(pct) / 7.0);
                        const r = Math.round(30 + (16 - 30) * ratio);
                        const g = Math.round(41 + (150 - 41) * ratio);
                        const b = Math.round(59 + (80 - 59) * ratio);
                        return `rgb(${r}, ${g}, ${b})`;
                    } else {
                        return 'rgb(50, 60, 75)';
                    }
                }

                // 構建 ECharts Treemap 數據結構
                // 這裡我們利用 ECharts 的 levels 屬性來實現階層化佈局
                const treeData = sortedSectors.map(sector => {
                    // 對每個族群內部的個股進行 Leader Partitioning 檢查
                    // 雖然我們主要靠 ECharts 渲染，但我們可以調整數據權重或分組來輔助
                    return {
                        name: canonicalGroupName(sector.name),
                        value: sector.totalValue,
                        children: sector.items.sort((a, b) => b.value - a.value).map(item => ({
                            name: `${item.name}\n${item.pct >= 0 ? '+' : ''}${item.pct}%`,
                            value: item.value,
                            symbol: item.id,
                            pct: item.pct,
                            itemStyle: {
                                color: getColorByPct(item.pct)
                            }
                        }))
                    };
                });

                container.innerHTML = ''; // 清空 loading
                container.style.minHeight = '';
                container.style.height = 'auto';
                const chartDom = document.createElement('div');
                chartDom.style.width = '100%';
                chartDom.style.flex = '0 0 auto';
                chartDom.style.minWidth = '0';
                const setHeatmapSize = () => {
                    const isMobileHeatmap = window.matchMedia('(max-width: 768px)').matches;
                    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 720;
                    const chartHeight = isMobileHeatmap
                        ? Math.max(560, Math.min(760, viewportHeight - 220))
                        : Math.max(680, Math.min(920, viewportHeight - 260));
                    chartDom.style.height = `${chartHeight}px`;
                    chartDom.style.minHeight = `${chartHeight}px`;
                };
                setHeatmapSize();
                container.appendChild(chartDom);

                setTimeout(() => {
                    if (!container.contains(chartDom)) return;
                    const isDark = document.documentElement.classList.contains('dark');
                    const myChart = echarts.init(chartDom, isDark ? 'dark' : null);
                    const resizeHeatmap = () => {
                        setHeatmapSize();
                        myChart.resize();
                    };
                    window.addEventListener('resize', resizeHeatmap);
                    window.addEventListener('orientationchange', () => setTimeout(resizeHeatmap, 160));
                    window.addEventListener('theme-changed', () => setTimeout(resizeHeatmap, 60));

                    const option = {
                        backgroundColor: 'transparent',
                        tooltip: {
                            formatter: function (info) {
                                if (!info.data || !info.data.symbol) return info.name;
                                const value = info.value;
                                const pct = info.data.pct;
                                const symbol = info.data.symbol;
                                const name = info.name.split('\n')[0];
                                return [
                                    `<div class="font-bold border-b border-gray-600 pb-1 mb-1">${name} (${symbol})</div>`,
                                    `成交金額: <b>${(value / 100000000).toFixed(2)} 億元</b><br/>`,
                                    `當日漲跌: <span style="color:${pct >= 0 ? '#ef4444' : '#10b981'}">${pct >= 0 ? '+' : ''}${pct}%</span>`
                                ].join('');
                            }
                        },
                        series: [{
                            type: 'treemap',
                            data: treeData,
                            leafDepth: 2,
                            roam: true,
                            nodeClick: 'zoomTo',
                            breadcrumb: { show: false },
                            left: 8,
                            right: 8,
                            top: 12,
                            bottom: 8,
                            label: {
                                show: true,
                                formatter: '{b}',
                                fontSize: window.matchMedia('(max-width: 768px)').matches ? 10 : 11,
                                color: '#fff'
                            },
                            upperLabel: {
                                show: true,
                                height: window.matchMedia('(max-width: 768px)').matches ? 22 : 24,
                                color: isDark ? '#fff' : '#111',
                                backgroundColor: isDark ? '#2d3748' : '#edf2f7',
                                fontSize: window.matchMedia('(max-width: 768px)').matches ? 11 : 12,
                                fontWeight: 'bold'
                            },
                            itemStyle: {
                                borderColor: isDark ? '#1a202c' : '#fff',
                                borderWidth: 1,
                                gapWidth: 1
                            },
                            levels: [
                                {
                                    itemStyle: {
                                        borderColor: isDark ? '#1a202c' : '#fff',
                                        borderWidth: 2,
                                        gapWidth: 2
                                    },
                                    upperLabel: { show: true }
                                },
                                {
                                    itemStyle: {
                                        borderColor: isDark ? '#2d3748' : '#f7fafc',
                                        borderWidth: 1,
                                        gapWidth: 1
                                    },
                                    // 🚀 v2.20.0: 強制 Squarified 佈局，並對權值股進行優化
                                    treemapStrategy: 'squarify'
                                }
                            ]
                        }]
                    };

                    myChart.setOption(option);
                    setTimeout(resizeHeatmap, 80);

                    myChart.on('click', function (params) {
                        if (params.data && params.data.symbol && params.treePathInfo.length > 2) {
                            if (window.StockDetail && typeof window.StockDetail.show === 'function') {
                                window.StockDetail.show(params.data.symbol);
                            }
                        } else if (params.data?.name) {
                            openGroupList(params.data.name);
                        }
                    });

                    myChart.resize();
                }, 50);

            } catch (err) {
                console.error(err);
                container.innerHTML = `<div class="text-center text-red-500 py-8">圖表加載失敗: ${err.message}</div>`;
            }
        }

        else if (subPage === '量化精選') {
            const holdingsTable = document.querySelector('#quant-holdings-table tbody');
            const signalsTable = document.querySelector('#quant-signals-table tbody');
            const statsContainer = document.getElementById('quant-stats');
            const paginationContainer = document.getElementById('quant-signals-pagination');
            const strategySelector = document.getElementById('quant-strategy-selector');
            const holdingsMobile = document.getElementById('quant-holdings-mobile');

            let allSignals = [];
            let currentPage = 1;
            const pageSize = 25;
            let stocksMeta = {};
            let strategyData = {};
            let currentStrategy = 'portfolio_combined';
            const strategyNames = {
                'trend': 'TREND', 'mr': 'MR',
                'ai_inst': 'AI_INST',
                'portfolio_combined': '組合', 'multi_factor': 'Multi-Factor'
            };

            const renderSignalsPage = (page) => {
                if (!signalsTable || !paginationContainer) return;
                const start = (page - 1) * pageSize;
                const end = start + pageSize;
                const pageData = allSignals.slice(start, end);

                signalsTable.innerHTML = pageData.map(s => {
                    const type = (s.type || s.action || 'BUY').toUpperCase();
                    const cleanStockId = s.symbol || s.stock || s.stock_id || '';
                    const stockName = stocksMeta[cleanStockId] || stocksMeta[cleanStockId.split('.')[0]] || '';
                    return `
                        <tr class="hover:bg-gray-800/30 transition-colors cursor-pointer" onclick="window.StockDetail.show('${cleanStockId.split('.')[0]}')">
                            <td class="px-6 py-4 font-mono text-gray-500">${s.entry_date || s.exit_date || s.date}</td>
                            <td class="px-6 py-4">${stockIdentityHTML(cleanStockId.split('.')[0], stockName || cleanStockId)}</td>
                            <td class="px-6 py-4">
                                <span class="px-2 py-0.5 rounded text-[10px] font-bold ${type === 'BUY' ? 'bg-red-500/10 text-red-500' : 'bg-green-500/10 text-green-500'}">
                                    ${type === 'BUY' ? '買進 BUY' : '賣出 SELL'}
                                </span>
                            </td>
                            <td class="px-6 py-4 text-right font-bold ${s.pe_ratio < 15 ? 'text-green-500' : s.pe_ratio >= 25 ? 'text-orange-500' : 'text-gray-600 dark:text-gray-300'}">${s.pe_ratio ? s.pe_ratio.toFixed(1) : '--'}</td>
                            <td class="px-6 py-4 text-xs">
                                ${s.select_reason ? `<span class="inline-block px-1.5 py-0.5 rounded text-[8px] font-bold mr-1 ${s.select_reason.includes('趨勢') ? 'text-red-500 bg-red-500/10' : s.select_reason.includes('法人') ? 'text-orange-500 bg-orange-500/10' : s.select_reason.includes('ETF') ? 'text-purple-500 bg-purple-500/10' : 'text-blue-500 bg-blue-500/10'}">${s.select_reason}</span>` : ''}
                                <span class="text-gray-450">${s.reason || s.label || 'SIGNAL'}</span>
                            </td>
                        </tr>
                    `;
                }).join('') || '<tr><td colspan="5" class="px-6 py-8 text-center text-gray-500">尚無近期訊號</td></tr>';

                const totalPages = Math.ceil(allSignals.length / pageSize) || 1;
                paginationContainer.innerHTML = `
                    <button class="px-3 py-1 rounded bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 disabled:opacity-30 transition-all" ${page === 1 ? 'disabled' : ''} id="prev-signals-page">上一頁</button>
                    <span class="font-mono">第 ${page} 頁 / ${totalPages} 頁 (共 ${allSignals.length} 筆)</span>
                    <button class="px-3 py-1 rounded bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 disabled:opacity-30 transition-all" ${page === totalPages ? 'disabled' : ''} id="next-signals-page">下一頁</button>
                `;

                document.getElementById('prev-signals-page')?.addEventListener('click', () => {
                    currentPage--;
                    renderSignalsPage(currentPage);
                });
                document.getElementById('next-signals-page')?.addEventListener('click', () => {
                    currentPage++;
                    renderSignalsPage(currentPage);
                });
            };

            const renderStrategy = async (data) => {
                // 清除上次渲染的殘留元素
                document.querySelector('#quant-source-stats')?.remove();
                document.querySelector('#quant-source-stats-placeholder')?.remove();

                const activeHoldings = (data.portfolio || []).filter(p => p.is_held);
                const isBull = data.regime === 'BULL' || data.regime === 'AGGRESSIVE';
                const cashRatio = data.nav ? ((data.cash || 0) / data.nav) * 100 : 0;

                if (statsContainer && data) {
                    statsContainer.innerHTML = `
                        <div class="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl border border-gray-100 dark:border-gray-800">
                            <div class="text-xs text-gray-500 mb-1 font-bold">${strategyNames[currentStrategy] || currentStrategy} NAV</div>
                            <div class="text-xl font-bold font-mono text-blue-600 dark:text-blue-400">$${(data.nav || 0).toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</div>
                        </div>
                        <div class="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl border border-gray-100 dark:border-gray-800">
                            <div class="text-xs text-gray-500 mb-1 font-bold">多空狀態 Regime</div>
                            <div class="text-xl font-bold font-mono ${isBull ? 'text-red-500' : 'text-green-500'}">
                                ${isBull ? '🔴 多頭市場' : '🟢 空頭避險'}
                            </div>
                        </div>
                        <div class="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl border border-gray-100 dark:border-gray-800">
                            <div class="text-xs text-gray-500 mb-1 font-bold">保留現金比率</div>
                            <div class="text-xl font-bold font-mono text-gray-900 dark:text-white">${cashRatio.toFixed(1)}%</div>
                        </div>
                        <div class="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl border border-gray-100 dark:border-gray-800">
                            <div class="text-xs text-gray-500 mb-1 font-bold">目前持股檔數</div>
                            <div class="text-xl font-bold font-mono text-gray-900 dark:text-white">${activeHoldings.length} 檔</div>
                        </div>
                    `;
                }
                // Regime Banner
                const regimeBanner = document.getElementById('regime-banner');
                if (regimeBanner && data.regime) {
                    const isAggressive = data.regime === 'AGGRESSIVE';
                    const isDefensive = data.regime === 'DEFENSIVE';
                    const config = data.regime_config || {};
                    const mode = config.mode || (isAggressive ? '積極進攻' : (isDefensive ? '保守防禦' : data.regime));
                    const desc = config.description || (isAggressive ? '加權指數站穩 60MA，市場多頭格局，系統積極建倉' : (isDefensive ? '轉向低 Beta / Alpha 穩健股' : ''));
                    const maxPos = config.max_positions ?? '-';
                    const dailyLimit = config.daily_entry_limit ?? '-';
                    regimeBanner.classList.remove('hidden');
                    if (isAggressive || isDefensive) {
                        regimeBanner.innerHTML = `
                            <div class="flex items-center justify-between p-3 rounded-xl text-white ${isAggressive ? 'bg-gradient-to-r from-orange-500 to-red-600' : 'bg-gradient-to-r from-indigo-600 to-blue-600'}">
                                <div class="flex items-center space-x-3">
                                    <span class="text-xl">${isAggressive ? '🔥' : '🛡️'}</span>
                                    <div>
                                        <div class="text-sm font-bold">${mode}</div>
                                        <div class="text-[10px] opacity-80">${desc}</div>
                                    </div>
                                </div>
                                <div class="text-[10px] font-mono opacity-70">持倉上限 ${maxPos}檔 · 每日 ${dailyLimit}檔</div>
                            </div>
                        `;
                    } else {
                        regimeBanner.innerHTML = `
                            <div class="flex items-center justify-between p-3 rounded-xl bg-gray-100 dark:bg-gray-800">
                                <div class="flex items-center space-x-3">
                                    <span>📊</span>
                                    <div class="text-sm font-bold">環境: ${data.regime}</div>
                                </div>
                            </div>
                        `;
                    }
                }
                // Live PMS
                const livePmsEl = document.getElementById('quant-live-pms');
                if (livePmsEl && data.performance) {
                    const perf = data.performance;
                    const liveTotalReturn = (perf.live_total_return ?? 0) * 100;
                    const liveSharpe = perf.live_sharpe ?? 0;
                    const liveDrawdown = (perf.live_max_drawdown ?? 0) * 100;
                    const liveWinRate = (perf.live_win_rate ?? 0) * 100;
                    const equity = perf.live_equity || [];
                    const returnColor = liveTotalReturn >= 0 ? 'text-red-500' : 'text-green-500';
                    livePmsEl.innerHTML = `
                        <div class="bg-white dark:bg-[#161b22] rounded-xl border border-gray-200 dark:border-gray-800 p-5">
                            <h3 class="font-bold text-gray-900 dark:text-white flex items-center text-sm mb-4">
                                <span class="mr-2">📈</span> 基金實戰監控 (Live PMS)
                            </h3>
                            <div class="grid grid-cols-2 gap-4">
                                <div class="bg-gray-50 dark:bg-gray-900/50 p-3 rounded-xl">
                                    <div class="text-[10px] text-gray-500 mb-1">實戰報酬</div>
                                    <div class="text-lg font-bold font-mono ${returnColor}">${liveTotalReturn.toFixed(2)}%</div>
                                </div>
                                <div class="bg-gray-50 dark:bg-gray-900/50 p-3 rounded-xl">
                                    <div class="text-[10px] text-gray-500 mb-1">實戰 Sharpe</div>
                                    <div class="text-lg font-bold font-mono text-orange-500">${liveSharpe.toFixed(2)}</div>
                                </div>
                                <div class="bg-gray-50 dark:bg-gray-900/50 p-3 rounded-xl">
                                    <div class="text-[10px] text-gray-500 mb-1">實戰回撤</div>
                                    <div class="text-lg font-bold font-mono text-green-500">${liveDrawdown.toFixed(2)}%</div>
                                </div>
                                <div class="bg-gray-50 dark:bg-gray-900/50 p-3 rounded-xl">
                                    <div class="text-[10px] text-gray-500 mb-1">實戰勝率</div>
                                    <div class="text-lg font-bold font-mono text-gray-900 dark:text-white">${liveWinRate.toFixed(1)}%</div>
                                </div>
                            </div>
                            ${equity.length > 0 ? `
                            <div class="mt-4 bg-gray-50 dark:bg-gray-900/50 p-3 rounded-xl">
                                <div class="text-[10px] text-gray-500 mb-2">實戰資產趨勢</div>
                                <div id="quant-equity-chart" class="w-full h-24"></div>
                            </div>` : ''}
                        </div>
                    `;
                    livePmsEl.classList.remove('hidden');
                    if (equity.length > 0) {
                        setTimeout(() => {
                            const chartDom = document.getElementById('quant-equity-chart');
                            if (!chartDom) return;
                            const isDark = document.documentElement.classList.contains('dark');
                            const chart = echarts.init(chartDom, isDark ? 'dark' : null);
                            chart.setOption({
                                backgroundColor: 'transparent', grid: { left: '5%', right: '5%', top: '5%', bottom: '5%' },
                                xAxis: { type: 'category', data: equity.map(e => e.date || ''), show: false },
                                yAxis: { type: 'value', show: false, scale: true },
                                series: [{
                                    type: 'line', data: equity.map(e => e.equity), smooth: true, showSymbol: false,
                                    areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(34,197,94,0.3)' }, { offset: 1, color: 'rgba(34,197,94,0)' }]) },
                                    lineStyle: { color: '#22c55e', width: 2 }, itemStyle: { color: '#22c55e' }
                                }]
                            });
                            window.addEventListener('resize', () => chart.resize());
                        }, 100);
                    }
                }
                // Virtual Account
                const capitalEl = document.getElementById('quant-capital-dashboard');
                if (capitalEl && data.metadata) {
                    const meta = data.metadata; const nav = data.nav || 0;
                    const totalCap = meta.total_capital || nav; const usedCap = meta.used_capital || 0;
                    const dashCash = data.cash !== undefined ? data.cash : (totalCap - usedCap);
                    const usageRatio = totalCap > 0 ? usedCap / totalCap : 0;
                    capitalEl.innerHTML = `
                        <div class="bg-white dark:bg-[#161b22] rounded-xl border border-gray-200 dark:border-gray-800 p-5">
                            <div class="flex items-center justify-between mb-4">
                                <h3 class="font-bold text-gray-900 dark:text-white flex items-center text-sm"><span class="mr-2">💰</span> 虛擬金帳戶狀態</h3>
                                <span class="text-xs font-mono font-bold text-blue-500">NAV: $${nav.toLocaleString(undefined, {maximumFractionDigits: 0})}</span>
                            </div>
                            <div class="flex justify-between mb-3">
                                <div><div class="text-[10px] text-gray-500 mb-0.5">可用現金 (Cash)</div>
                                    <div class="text-sm font-bold font-mono text-gray-900 dark:text-white">$${dashCash.toLocaleString(undefined, {maximumFractionDigits: 0})}</div></div>
                                <div class="text-right"><div class="text-[10px] text-gray-500 mb-0.5">已用資金 (Used)</div>
                                    <div class="text-sm font-bold font-mono text-orange-500">$${usedCap.toLocaleString(undefined, {maximumFractionDigits: 0})}</div></div>
                            </div>
                            <div class="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                <div class="h-full rounded-full bg-gradient-to-r from-orange-400 to-green-500" style="width: ${(usageRatio * 100).toFixed(0)}%"></div>
                            </div>
                            <div class="flex justify-between mt-1">
                                <span class="text-[10px] text-gray-500">資金利用率</span>
                                <span class="text-[10px] font-bold text-gray-500">${(usageRatio * 100).toFixed(0)}%</span>
                            </div>
                        </div>
                    `;
                    capitalEl.classList.remove('hidden');
                }
                // Alpha Allocation
                const alphaEl = document.getElementById('quant-alpha-allocation');
                if (alphaEl && data.alpha_allocation && data.alpha_allocation.length > 0) {
                    const alphaLabel = { 'TREND': '趨勢對沖', 'MR': '反轉對沖' };
                    alphaEl.innerHTML = `
                        <div class="bg-white dark:bg-[#161b22] rounded-xl border border-gray-200 dark:border-gray-800 p-5">
                            <h3 class="font-bold text-gray-900 dark:text-white flex items-center text-sm mb-4"><span class="mr-2">🧠</span> Alpha 策略權重分佈</h3>
                            <div class="grid grid-cols-2 gap-4">${[...data.alpha_allocation].sort((a, b) => b.weight - a.weight).map(a => {
                                const label = alphaLabel[a.strategy] || a.strategy;
                                const scoreLabel = a.strategy === 'TREND' ? 'Beta' : 'Alpha';
                                return `<div class="bg-gray-50 dark:bg-gray-900/50 p-3 rounded-xl">
                                    <div class="flex items-center justify-between mb-2">
                                        <span class="text-xs font-bold">${label}</span>
                                        <span class="text-[10px] text-gray-500">(${scoreLabel}: ${(a.score || 0).toFixed(2)})</span>
                                    </div>
                                    <div class="text-lg font-bold font-mono text-orange-500">${(a.weight * 100).toFixed(0)}%</div>
                                    <div class="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full mt-2 overflow-hidden">
                                        <div class="h-full bg-orange-500 rounded-full" style="width: ${(a.weight * 100).toFixed(0)}%"></div>
                                    </div>
                                </div>`; }).join('')}
                            </div>
                        </div>
                    `;
                    alphaEl.classList.remove('hidden');
                }
                // 選股來源分布統計
                const candidates = (data.portfolio || []).filter(p => !p.is_held && (p.entry_reason === 'SIGNAL' || p.action === 'BUY'));
                const allItems = [...activeHoldings, ...candidates];
                const srcStats = { 趨勢跟蹤: 0, 法人建倉: 0, 均值回歸: 0, ETF動能: 0, 其他: 0 };
                allItems.forEach(item => {
                    const r = item.select_reason || item.entry_reason || '';
                    if (r.includes('趨勢跟蹤')) srcStats['趨勢跟蹤']++;
                    else if (r.includes('法人建倉')) srcStats['法人建倉']++;
                    else if (r.includes('均值回歸')) srcStats['均值回歸']++;
                    else if (r.includes('ETF動能')) srcStats['ETF動能']++;
                    else srcStats['其他']++;
                });
                const totalSrc = Object.values(srcStats).reduce((a, b) => a + b, 0) || 1;
                const srcBarHtml = `
                    <div class="bg-white dark:bg-[#161b22] rounded-xl border border-gray-200 dark:border-gray-800 p-4">
                        <div class="flex items-center justify-between mb-3">
                            <h3 class="font-bold text-gray-900 dark:text-white text-sm">📊 選股來源分布（共 ${allItems.length} 檔）</h3>
                            <span class="text-[10px] text-gray-500 font-mono">持倉 ${activeHoldings.length} · 候選 ${candidates.length}</span>
                        </div>
                        <div class="space-y-2">${Object.entries({ '趨勢跟蹤': 'red', '法人建倉': 'orange', '均值回歸': 'blue' }).map(([name, color]) => {
                            const count = srcStats[name] || 0; const pct = (count / totalSrc * 100).toFixed(0);
                            const barColor = color === 'red' ? 'bg-red-500' : color === 'orange' ? 'bg-orange-500' : 'bg-blue-500';
                            const textColor = color === 'red' ? 'text-red-500' : color === 'orange' ? 'text-orange-500' : 'text-blue-500';
                            return count > 0 ? `<div class="flex items-center text-xs">
                                <span class="w-16 font-bold ${textColor}">${name}</span>
                                <span class="w-10 text-right font-mono text-gray-500">${pct}%</span>
                                <div class="flex-1 h-3 bg-gray-100 dark:bg-gray-800 rounded-full mx-2 overflow-hidden">
                                    <div class="h-full ${barColor} rounded-full" style="width: ${pct}%"></div></div>
                                <span class="w-8 text-right font-mono text-gray-400">${count}檔</span>
                            </div>` : '';
                        }).join('')}
                        ${srcStats['ETF動能'] > 0 ? `<div class="flex items-center text-xs pt-1 border-t border-gray-100 dark:border-gray-800">
                            <span class="w-16 font-bold text-purple-500">ETF動能</span>
                            <span class="w-10 text-right font-mono text-gray-500">${(srcStats['ETF動能'] / totalSrc * 100).toFixed(0)}%</span>
                            <div class="flex-1 h-3 bg-gray-100 dark:bg-gray-800 rounded-full mx-2 overflow-hidden">
                                <div class="h-full bg-purple-500 rounded-full" style="width: ${(srcStats['ETF動能'] / totalSrc * 100).toFixed(0)}%"></div></div>
                            <span class="w-8 text-right font-mono text-gray-400">${srcStats['ETF動能']}檔</span>
                        </div>` : ''}
                        ${srcStats['其他'] > 0 ? `<div class="flex items-center text-xs pt-1 border-t border-gray-100 dark:border-gray-800">
                            <span class="w-16 font-bold text-gray-500">其他</span>
                            <span class="w-10 text-right font-mono text-gray-500">${(srcStats['其他'] / totalSrc * 100).toFixed(0)}%</span>
                            <div class="flex-1 h-3 bg-gray-100 dark:bg-gray-800 rounded-full mx-2 overflow-hidden">
                                <div class="h-full bg-gray-400 rounded-full" style="width: ${(srcStats['其他'] / totalSrc * 100).toFixed(0)}%"></div></div>
                            <span class="w-8 text-right font-mono text-gray-400">${srcStats['其他']}檔</span>
                        </div>` : ''}</div></div>`;
                const holdingsCard = document.querySelector('#quant-holdings-table')?.closest('.rounded-xl.border');
                if (holdingsCard && holdingsCard.parentNode) {
                    const existing = document.querySelector('#quant-source-stats');
                    if (existing) existing.remove();
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = `<div id="quant-source-stats">${srcBarHtml}</div>`;
                    holdingsCard.parentNode.insertBefore(tempDiv.firstElementChild, holdingsCard);
                }
                if (holdingsTable) {
                    const holdingQuoteMap = await api.fetchQuotes(activeHoldings.map(p => p.stock.replace(/\.TW(O)?$/, ''))).catch(() => ({}));
                    if (activeHoldings.length === 0) {
                        holdingsTable.innerHTML = `<tr><td colspan="13" class="px-6 py-8 text-center text-gray-500">模型目前無持股，保持全現金觀望。</td></tr>`;
                        if (holdingsMobile) holdingsMobile.innerHTML = '<div class="px-5 py-8 text-center text-gray-500 text-sm">模型目前無持股，保持全現金觀望。</div>';
                    } else {
                        const fairValueMap = data.__fairValueMap || {};
                        holdingsTable.innerHTML = activeHoldings.map(p => {
                            const name = stocksMeta[p.stock] || stocksMeta[p.stock.replace(/\.TW(O)?$/, '')] || p.stock;
                            const cleanStockId = p.stock.replace(/\.TW(O)?$/, '');
                            const quote = formatStockQuote(holdingQuoteMap[cleanStockId]);
                            const rawRet = p.return_pct !== undefined ? p.return_pct : (p.return !== undefined ? p.return * 100 : 0);
                            const isProfit = rawRet >= 0; const action = p.action || 'HOLD';
                            const actionColor = action === 'BUY' ? 'bg-red-500/10 text-red-500' : (action === 'SELL' ? 'bg-green-500/10 text-green-500' : 'bg-gray-500/10 text-gray-400');
                            const reason = p.select_reason || '';
                            const reasonColor = reason.includes('趨勢') ? 'text-red-500 bg-red-500/10' : reason.includes('法人') ? 'text-orange-500 bg-orange-500/10' : reason.includes('ETF') ? 'text-purple-500 bg-purple-500/10' : 'text-blue-500 bg-blue-500/10';
                            const peRatio = p.pe_ratio;
                            const peColor = peRatio < 15 ? 'text-green-500' : peRatio < 25 ? 'text-gray-600 dark:text-gray-300' : 'text-orange-500';
                            const peStr = peRatio ? peRatio.toFixed(1) : '--';
                            const fairValue = fairValueMap[cleanStockId];
                             return `<tr class="hover:bg-gray-50 dark:hover:bg-gray-900/30 cursor-pointer" onclick="window.StockDetail.show('${cleanStockId}')">
                                 <td class="px-6 py-4">${stockIdentityHTML(cleanStockId, name)}</td>
                                  <td class="px-6 py-4 text-right font-bold ${quote.valueClass}">${quote.priceText}</td>
                                  <td class="px-6 py-4 text-right font-bold ${quote.valueClass}">${quote.changeText}</td>
                                  <td class="px-6 py-4 text-left">${reason ? `<span class="inline-block px-2 py-0.5 rounded text-[10px] font-bold ${reasonColor}">${reason}</span>` : ''}</td>
                                  <td class="px-6 py-4 text-right font-bold text-gray-700 dark:text-gray-300">${((p.weight || 0) * 100).toFixed(1)}%</td>
                                  <td class="px-6 py-4 text-right text-gray-500 font-mono text-xs">${p.entry_date || '--'}</td>
                                  <td class="px-6 py-4 text-right font-mono text-xs text-gray-500">${p.shares ? p.shares.toLocaleString() : '--'}</td>
                                  <td class="px-6 py-4 text-right font-mono text-xs text-blue-500">${p.entry_price ? p.entry_price.toFixed(0) : '--'}</td>
                                  <td class="px-6 py-4 text-right font-bold ${isProfit ? 'text-red-500' : 'text-green-500'}">${isProfit ? '+' : ''}${rawRet.toFixed(2)}%</td>
                                  <td class="px-6 py-4 text-right text-xs text-gray-500">${p.chips || p.chip_label || ''}</td>
                                  <td class="px-6 py-4 text-right"><span class="px-2 py-1 rounded text-xs font-bold ${actionColor}">${action}</span></td>
                                  <td class="px-6 py-4 text-right font-bold ${peColor}">${peStr}</td>
                                  <td class="px-6 py-4 text-right">${fairValueHTML(fairValue)}</td>
                             </tr>`;
                        }).join('');
                        StockListPreferences.applyAll();
                        if (holdingsMobile) {
                            holdingsMobile.innerHTML = activeHoldings.map(p => {
                                const cleanStockId = p.stock.replace(/\.TW(O)?$/, '');
                                const name = stocksMeta[p.stock] || stocksMeta[cleanStockId] || p.stock;
                                const quote = formatStockQuote(holdingQuoteMap[cleanStockId]);
                                const rawRet = p.return_pct !== undefined ? p.return_pct : (p.return !== undefined ? p.return * 100 : 0);
                                const action = p.action || 'HOLD';
                                const peStr = p.pe_ratio ? p.pe_ratio.toFixed(1) : '--';
                                const fairValue = (data.__fairValueMap || {})[cleanStockId];
                                return stockMobileCardHTML({
                                    symbol: cleanStockId,
                                    name,
                                    primaryHTML: `<div class="text-right"><div class="font-bold ${rawRet >= 0 ? 'text-red-500' : 'text-green-500'}">${rawRet >= 0 ? '+' : ''}${rawRet.toFixed(1)}%</div><div class="text-[10px]">區間報酬</div></div>`,
                                    quoteHTML: `<div class="${quote.valueClass}"><div class="font-bold">${quote.priceText}</div><div class="text-[10px]">${quote.changeText}</div></div>`,
                                    valuation: fairValue,
                                    metricsHTML: stockMetricHTML('配置權重', `${((p.weight || 0) * 100).toFixed(1)}%`) +
                                        stockMetricHTML('本益比', peStr) +
                                        stockMetricHTML('操作', action),
                                    detailHTML: p.select_reason || p.entry_reason || '',
                                    onClick: `window.StockDetail.show('${cleanStockId}')`
                                });
                            }).join('');
                        }
                    }
                }
                // Trade Log
                const tradeLogEl = document.getElementById('quant-trade-log');
                if (tradeLogEl && data.trade_log && data.trade_log.length > 0) {
                    const trades = data.trade_log.slice(0, 20);
                    tradeLogEl.innerHTML = `
                        <div class="bg-white dark:bg-[#161b22] rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                            <div class="p-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50 flex-none">
                                <h3 class="font-bold text-gray-900 dark:text-white flex items-center text-sm"><span class="mr-2">🕐</span> 實戰動態日誌 (近期進出場)</h3>
                            </div>
                            <div class="divide-y divide-gray-100 dark:divide-gray-800">${trades.map(t => {
                                const isBuy = t.action === 'BUY' || !t.exit_date;
                                const stockName = stocksMeta[t.stock] || ''; const ret = t.return;
                                const hasReturn = ret !== undefined && ret !== null;
                                return `<div class="p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-900/30">
                                    <div class="min-w-0 flex-1">
                                        <div class="font-bold text-sm text-gray-900 dark:text-white">${stockName || t.stock}</div>
                                        <div class="flex items-center space-x-2 mt-1">
                                            <span class="px-1.5 py-0.5 rounded text-[10px] font-bold ${isBuy ? 'bg-blue-500/10 text-blue-500' : 'bg-orange-500/10 text-orange-500'}">${isBuy ? '已買入' : '已賣出'}</span>
                                            <span class="text-[10px] font-mono text-gray-500">${t.stock}</span>
                                        </div>
                                        ${t.select_reason ? `<div class="mt-1"><span class="inline-block px-1.5 py-0.5 rounded text-[8px] font-bold ${t.select_reason.includes('趨勢') ? 'text-red-500 bg-red-500/10' : t.select_reason.includes('法人') ? 'text-orange-500 bg-orange-500/10' : t.select_reason.includes('ETF') ? 'text-purple-500 bg-purple-500/10' : 'text-blue-500 bg-blue-500/10'}">${t.select_reason}</span></div>` : ''}
                                    </div>
                                    <div class="text-right mx-4 flex-shrink-0">
                                        <div class="text-[10px] font-mono text-gray-500">${t.exit_date ? `${t.entry_date} → ${t.exit_date}` : `買入於 ${t.entry_date}`}</div>
                                        <div class="flex items-center justify-end space-x-2 mt-0.5">
                                            ${t.entry_price ? `<span class="text-[10px] font-mono text-blue-500">買${t.entry_price.toFixed(0)}</span>` : ''}
                                            ${t.exit_price ? `<span class="text-[10px] font-mono text-orange-500">賣${t.exit_price.toFixed(0)}</span>` : ''}
                                            ${t.shares ? `<span class="text-[10px] font-mono text-gray-500">${t.shares}股</span>` : ''}
                                        </div>
                                        <div class="text-[10px] text-gray-500">${t.reason || t.entry_reason || (isBuy ? '策略進場' : '策略出場')}</div>
                                    </div>
                                    <div class="text-right min-w-[70px] flex-shrink-0">
                                        ${hasReturn ? `<span class="text-sm font-bold font-mono ${ret >= 0 ? 'text-red-500' : 'text-green-500'}">${(ret * 100).toFixed(2)}%</span>` : '<span class="text-xs font-bold text-blue-500">持倉中</span>'}
                                    </div>
                                </div>`;
                            }).join('')}</div>
                        </div>`;
                    tradeLogEl.classList.remove('hidden');
                } else if (tradeLogEl) {
                    tradeLogEl.classList.add('hidden');
                }
                // Signals table
                const signalCandidates = (data.portfolio || []).filter(p => !p.is_held && (p.entry_reason === 'SIGNAL'));
                allSignals = signalCandidates.map(c => ({
                    entry_date: data.date, symbol: c.stock, type: 'BUY',
                    select_reason: c.select_reason || '', reason: c.select_reason || '模型選入',
                    pe_ratio: c.pe_ratio
                }));
                const portfolioPeMap = {};
                (data.portfolio || []).forEach(p => { if (p.stock && p.pe_ratio != null) portfolioPeMap[p.stock] = p.pe_ratio; });
                if (data.trade_log && data.trade_log.length > 0) {
                    const tradeSignals = data.trade_log.map(t => ({
                        entry_date: t.entry_date || t.exit_date || '', symbol: t.stock,
                        type: t.action === 'SELL' ? 'SELL' : 'BUY',
                        select_reason: t.select_reason || '',
                        reason: t.reason || t.select_reason || (t.action === 'SELL' ? '策略出場' : '策略進場'),
                        pe_ratio: t.pe_ratio ?? portfolioPeMap[t.stock] ?? null
                    }));
                    const seen = new Set(allSignals.map(s => s.symbol + '_' + s.entry_date));
                    allSignals = [...allSignals, ...tradeSignals.filter(t => !seen.has(t.symbol + '_' + t.entry_date))];
                }
                if (allSignals.length > 0) allSignals.sort((a, b) => new Date(b.entry_date || b.date || 0) - new Date(a.entry_date || a.date || 0));
                renderSignalsPage(1);
            };

            // Data loader + strategy switcher
            try {
                const meta = await api.getStocksMeta();
                if (meta && Array.isArray(meta.stocks)) {
                    meta.stocks.forEach(s => { stocksMeta[s.symbol] = s.name; });
                }
            } catch(e) { console.warn("Meta fetch failed", e); }

            try {
                const sf = ['trend', 'mr', 'ai_inst', 'portfolio_combined', 'multi_factor'];
                const loaded = await Promise.all(
                    sf.map(s => api.fetchLocalJson(`quant/live_${s}.json`).catch(() => null))
                );
                strategyData = {};
                sf.forEach((s, i) => { if (loaded[i]) strategyData[s] = loaded[i]; });
                if (!strategyData[currentStrategy]) currentStrategy = Object.keys(strategyData)[0] || 'portfolio_combined';
                if (strategySelector) {
                    strategySelector.innerHTML = sf.map(sid => `
                        <button class="strategy-btn px-4 py-2 rounded-xl text-sm font-bold transition-all ${currentStrategy === sid ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}" data-strategy="${sid}">
                            ${strategyNames[sid] || sid}
                            ${strategyData[sid] ? `<span class="ml-1 text-[10px] opacity-70">$${(strategyData[sid].nav || 0).toLocaleString()}</span>` : ''}
                        </button>
                    `).join('');
                    strategySelector.querySelectorAll('.strategy-btn').forEach(btn => {
                        btn.addEventListener('click', () => {
                            currentStrategy = btn.dataset.strategy;
                            renderStrategy(strategyData[currentStrategy]);
                            strategySelector.querySelectorAll('.strategy-btn').forEach(b => {
                                b.className = 'strategy-btn px-4 py-2 rounded-xl text-sm font-bold transition-all ' + (b.dataset.strategy === currentStrategy ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700');
                            });
                        });
                    });
                }
                const fairValueMap = await api.fetchFairValueMap().catch(() => ({}));
                Object.values(strategyData).forEach(strategy => { if (strategy) strategy.__fairValueMap = fairValueMap; });
                renderStrategy(strategyData[currentStrategy]);
            } catch (err) { console.error("量化數據載入失敗:", err); }
        }

        else if (subPage === '精選策略') {
            const container = document.getElementById('strategies-container');
            if (!container) return;

            try {
                const data = await api.fetchLocalJson('quant/latest_strategies.json');
                const strategies = data.strategies || [];

                if (strategies.length === 0) {
                    container.innerHTML = `<div class="col-span-full text-center py-12 text-gray-500">暫無可用交易策略。</div>`;
                    return;
                }

                container.innerHTML = strategies.map(s => {
                    const ratingStars = '⭐'.repeat(Math.max(0, Math.min(5, Math.round(s.score || 4))));
                    const name = s.name || s.desc || '--';
                    const runDays = s.run_days || s.age || '--';
                    const entryDsl = s.rules?.entry || s.dsl || '--';
                    const exitDsl = s.rules?.exit || s.exit_dsl || '--';
                    const showDash = s.dsl === 'total_account';
                    const btReturn = s.backtest_total_return !== undefined ? s.backtest_total_return * 100 : (s.cagr !== undefined ? s.cagr : (s.return_pct !== undefined ? s.return_pct : 0));
                    const btSharpe = s.backtest_sharpe !== undefined ? s.backtest_sharpe : (s.sharpe || 0);
                    const btWinRate = s.backtest_win_rate !== undefined ? s.backtest_win_rate : (s.win_rate || 0);
                    const isProfit = btReturn >= 0;
                    return `
                        <div class="bg-white dark:bg-[#161b22] p-6 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm hover:shadow-md transition-shadow flex flex-col space-y-4">
                            <div class="flex justify-between items-start">
                                <div>
                                    <h4 class="font-bold text-base text-gray-900 dark:text-white">${name}</h4>
                                    <div class="text-xs text-gray-400 mt-0.5 font-mono">持續運行: ${runDays} 天</div>
                                </div>
                                <div class="text-sm font-bold text-yellow-500">${ratingStars}</div>
                            </div>

                            ${s.note ? `<p class="text-xs text-gray-500 dark:text-gray-400 leading-relaxed bg-blue-50/50 dark:bg-blue-900/10 p-2.5 rounded-lg border border-blue-100 dark:border-blue-900/30">${s.note}</p>` : ''}
                            ${s.params ? `<p class="text-[10px] font-mono text-orange-500 leading-relaxed bg-orange-50/50 dark:bg-orange-900/10 px-2.5 py-1.5 rounded-lg border border-orange-200/50 dark:border-orange-900/30">⚙️ ${s.params}</p>` : ''}

                            <div class="grid grid-cols-3 gap-2 bg-gray-50 dark:bg-gray-900/50 p-3 rounded-xl font-mono text-center">
                                <div>
                                    <div class="text-[10px] text-gray-400">總報酬率</div>
                                    <div class="text-xs font-bold ${showDash ? 'text-gray-400' : (isProfit ? 'text-red-500' : 'text-green-500')}">
                                        ${showDash ? '--' : (isProfit ? '+' : '') + btReturn.toFixed(1) + '%'}
                                    </div>
                                </div>
                                <div>
                                    <div class="text-[10px] text-gray-400">夏普值</div>
                                    <div class="text-xs font-bold text-blue-500">${showDash ? '--' : btSharpe.toFixed(2)}</div>
                                </div>
                                <div>
                                    <div class="text-[10px] text-gray-400">歷史勝率</div>
                                    <div class="text-xs font-bold text-purple-500">${showDash ? '--' : (btWinRate * 100).toFixed(0) + '%'}</div>
                                </div>
                            </div>

                            <div class="flex-1 space-y-2">
                                <div class="text-xs">
                                    <span class="font-bold text-gray-700 dark:text-gray-300">進場條件:</span>
                                    <code class="block bg-gray-100 dark:bg-gray-800 p-2 rounded mt-1 font-mono text-[10px] text-gray-600 dark:text-gray-400 break-all leading-normal whitespace-pre-wrap">${entryDsl}</code>
                                </div>
                                <div class="text-xs">
                                    <span class="font-bold text-gray-700 dark:text-gray-300">出場條件:</span>
                                    <code class="block bg-gray-100 dark:bg-gray-800 p-2 rounded mt-1 font-mono text-[10px] text-gray-600 dark:text-gray-400 break-all leading-normal whitespace-pre-wrap">${exitDsl}</code>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('');

                // 🧠 量化系統運作機制說明
                try {
                    const epData = await api.fetchLocalJson('quant/evolved_params.json');
                    const ep = (epData && epData.global) ? epData.global : {};
                    const rsExit = ep.rs_exit || '--';
                    const mrRsi = ep.mr_rsi_exit || '--';
                    const trailGap = ep.trailing_gap ? (ep.trailing_gap * 100).toFixed(0) : '--';
                    container.innerHTML += `
                        <details class="bg-white dark:bg-[#161b22] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
                            <summary class="px-5 py-3 text-xs font-bold text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 cursor-pointer select-none flex items-center">
                                🧠 量化系統運作機制
                                <svg class="ml-2 w-3 h-3 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                            </summary>
                            <div class="px-5 pb-5 text-[11px] text-gray-600 dark:text-gray-400 leading-relaxed space-y-3 font-mono">
                                <div><div class="font-bold text-gray-700 dark:text-gray-300">📅 train（每週六）</div>
                                    <div class="pl-3 border-l-2 border-gray-200 dark:border-gray-700 mt-1">回放最近 120 天歷史資料，從 100 萬初始資金開始模擬交易。<br>計算 TREND / MR / Portfolio 的 Sharpe、總報酬率、勝率。<br>訓練結束後自動執行 optimize() 搜尋最佳出場參數，<br>以 Portfolio Sharpe 最高為目標調整 RS_exit / MR_RSI_exit。</div></div>
                                <div><div class="font-bold text-gray-700 dark:text-gray-300">📅 run（每交易日）</div>
                                    <div class="pl-3 border-l-2 border-gray-200 dark:border-gray-700 mt-1">接續前一天的實戰持倉與資金，執行當日交易決策。<br>產出 latest_portfolio.json（持股、候選、交易紀錄、績效）。<br>產出 latest_strategies.json（策略回測數字 + 演化後參數）。<br>每天晚上台灣時間 20:00 由 GitHub Actions 自動執行。</div></div>
                                <div><div class="font-bold text-gray-700 dark:text-gray-300">🧬 策略演化（Evolution Engine）</div>
                                    <div class="pl-3 border-l-2 border-gray-200 dark:border-gray-700 mt-1">analyze_regret() — 賣出後若股價再漲 15%+ → 放寬該主題 RS 出場閾值；MR 賣出後反彈續強 → 調高 RSI 出場閾值<br>optimize() — 每週訓練後對 rs_exit（80~92）、mr_rsi_exit（75~85）做網格搜尋，選出 Portfolio Sharpe 最高的參數組合</div></div>
                                <div><div class="font-bold text-gray-700 dark:text-gray-300">📊 回測績效計算（PerformanceMetrics）</div>
                                    <div class="pl-3 border-l-2 border-gray-200 dark:border-gray-700 mt-1">淨值曲線 equity → pct_change() → 日報酬率序列<br>Total Return =（最終淨值 - 初始資金）/ 初始資金<br>Sharpe Ratio = avg(日報酬) / std(日報酬) × √252<br>Max Drawdown = min(（淨值 - 歷史高點）/ 歷史高點)<br>Win Rate = 獲利交易次數 / 總交易次數</div></div>
                                <div class="bg-gray-50 dark:bg-gray-900/50 p-3 rounded-lg">
                                    <span class="font-bold text-gray-700 dark:text-gray-300">⚙️ 當前演化參數</span>
                                    <div class="grid grid-cols-3 gap-2 mt-2 text-[10px]">
                                        <div class="bg-white dark:bg-gray-800 p-2 rounded border border-gray-200 dark:border-gray-700 text-center"><div class="text-gray-400">RS_exit</div><div class="font-bold text-orange-500">${rsExit}</div></div>
                                        <div class="bg-white dark:bg-gray-800 p-2 rounded border border-gray-200 dark:border-gray-700 text-center"><div class="text-gray-400">MR_RSI_exit</div><div class="font-bold text-orange-500">${mrRsi}</div></div>
                                        <div class="bg-white dark:bg-gray-800 p-2 rounded border border-gray-200 dark:border-gray-700 text-center"><div class="text-gray-400">Trailing Gap</div><div class="font-bold text-orange-500">${trailGap}%</div></div>
                                    </div></div></div></details>`;
                } catch(e) { console.warn('System desc load failed', e); }

            } catch (err) {
                console.error(err);
                container.innerHTML = `<div class="col-span-full text-center text-red-500 py-12">載入策略失敗: ${err.message}</div>`;
            }
        }

        else if (subPage === '今日最熱') {
            const container = document.getElementById('hottest-container');
            if (!container) return;

            try {
                const indexData = await api.fetchLocalJson('index.json');
                const latestDate = indexData.latest_daily_tw;
                if (!latestDate) throw new Error('No latest daily trading date found');

                const [dailyData, stocksMeta] = await Promise.all([
                    api.fetchLocalJson(`daily/tw/${latestDate}.json`),
                    api.fetchLocalJson('meta/stocks.json').then(data => {
                        const map = {};
                        if (data && Array.isArray(data.stocks)) {
                            data.stocks.forEach(s => { map[s.symbol] = s.name; });
                        }
                        return map;
                    }).catch(() => ({}))
                ]);

                const rawStocks = dailyData.stocks || [];

                const topVolume = [...rawStocks]
                    .sort((a, b) => (b.t || 0) - (a.t || 0))
                    .slice(0, 10);

                const topGainers = [...rawStocks]
                    .filter(s => s.pct !== undefined)
                    .sort((a, b) => b.pct - a.pct)
                    .slice(0, 10);

                const topLosers = [...rawStocks]
                    .filter(s => s.pct !== undefined)
                    .sort((a, b) => a.pct - b.pct)
                    .slice(0, 10);

                const topInstitutional = [...rawStocks]
                    .map(s => ({
                        ...s,
                        total_buy: (s.f || 0) + (s.it || 0) + (s.d || 0)
                    }))
                    .sort((a, b) => b.total_buy - a.total_buy)
                    .slice(0, 10);

                const renderTable = (title, icon, list, valFormatter) => {
                    return `
                        <div class="bg-white dark:bg-[#161b22] rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden flex flex-col h-full shadow-sm">
                            <div class="p-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50 flex items-center justify-between">
                                <h3 class="font-bold text-gray-900 dark:text-white flex items-center text-sm">
                                    <span class="mr-2">${icon}</span> ${title}
                                </h3>
                            </div>
                            <div class="overflow-x-auto flex-1">
                                <table class="w-full text-left text-xs">
                                    <thead class="bg-gray-50/30 dark:bg-gray-900/30 text-gray-400 uppercase font-mono">
                                        <tr>
                                            <th class="px-4 py-2">名次/個股</th>
                                            <th class="px-4 py-2 text-right">收盤</th>
                                            <th class="px-4 py-2 text-right">漲跌</th>
                                            <th class="px-4 py-2 text-right">指標</th>
                                        </tr>
                                    </thead>
                                    <tbody class="divide-y divide-gray-100 dark:divide-gray-800 font-mono text-gray-400">
                                        ${list.map((s, idx) => {
                                            const name = stocksMeta[s.id] || s.id;
                                            const pct = s.pct || 0;
                                            const color = pct >= 0 ? 'text-red-500' : 'text-green-500';
                                            return `
                                                <tr class="hover:bg-gray-50 dark:hover:bg-gray-900/30 cursor-pointer" onclick="window.StockDetail.show('${s.id}')">
                                                    <td class="px-4 py-2">
                                                        <div class="flex items-center space-x-2">
                                                        <span class="w-4 h-4 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-[10px] text-gray-500 font-bold">${idx + 1}</span>
                                                        ${stockIdentityHTML(s.id, name)}
                                                        </div>
                                                    </td>
                                                    <td class="px-4 py-2 text-right font-bold text-gray-700 dark:text-gray-300">${s.c?.toFixed(2) || '--'}</td>
                                                    <td class="px-4 py-2 text-right font-bold ${color}">${pct >= 0 ? '+' : ''}${pct}%</td>
                                                    <td class="px-4 py-2 text-right text-gray-500 font-bold">${valFormatter(s)}</td>
                                                </tr>
                                            `;
                                        }).join('')}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    `;
                };

                container.innerHTML = `
                    ${renderTable('成交大戶 (日交易額)', '💰', topVolume, s => `${(s.t / 100000000).toFixed(1)} 億`)}
                    ${renderTable('今日領漲個股', '🔥', topGainers, s => `+${s.pct}%`)}
                    ${renderTable('今日重挫個股', '❄️', topLosers, s => `${s.pct}%`)}
                    ${renderTable('三大法人合買', '🤝', topInstitutional, s => {
                        const lots = s.total_buy / 1000;
                        return `${lots >= 0 ? '+' : ''}${lots.toFixed(0)} 張`;
                    })}
                `;

            } catch (err) {
                console.error(err);
                container.innerHTML = `<div class="col-span-full text-center text-red-500 py-12">今日熱點加載失敗: ${err.message}</div>`;
            }
        }

        else if (subPage === 'ETF流量') {
            const buyContainer = document.getElementById('etf-flow-buy-table');
            const sellContainer = document.getElementById('etf-flow-sell-table');
            const perfContainer = document.getElementById('etf-flow-performance-table');
            const panelFlow = document.getElementById('etf-flow-panel-flow');
            const panelPerf = document.getElementById('etf-flow-panel-perf');
            const tabFlow = document.getElementById('etf-flow-tab-flow');
            const tabPerf = document.getElementById('etf-flow-tab-perf');

            function switchTab(tab) {
                const isFlow = tab === 'flow';
                panelFlow?.classList.toggle('hidden', !isFlow);
                panelPerf?.classList.toggle('hidden', isFlow);
                tabFlow?.classList.toggle('bg-blue-500/10', isFlow);
                tabFlow?.classList.toggle('text-blue-600', isFlow);
                tabFlow?.classList.toggle('dark:text-blue-400', isFlow);
                tabFlow?.classList.toggle('border-blue-200', isFlow);
                tabFlow?.classList.toggle('dark:border-blue-800', isFlow);
                tabFlow?.classList.toggle('text-gray-500', !isFlow);
                tabPerf?.classList.toggle('bg-purple-500/10', !isFlow);
                tabPerf?.classList.toggle('text-purple-600', !isFlow);
                tabPerf?.classList.toggle('dark:text-purple-400', !isFlow);
                tabPerf?.classList.toggle('border-purple-200', !isFlow);
                tabPerf?.classList.toggle('dark:border-purple-800', !isFlow);
                tabPerf?.classList.toggle('text-gray-500', isFlow);
            }
            tabFlow?.addEventListener('click', () => { switchTab('flow'); });
            tabPerf?.addEventListener('click', () => { switchTab('perf'); loadYearPerformance(); });

            function renderFlowTable(items, container, color) {
                if (!container || !items?.length) {
                    if (container) container.innerHTML = '<div class="text-center py-8 text-gray-500">無數據</div>';
                    return;
                }
                container.innerHTML = `
                    <table class="w-full text-left">
                        <thead class="bg-gray-50/50 dark:bg-gray-900/50 text-gray-400 dark:text-gray-500 text-xs uppercase">
                            <tr>
                                <th class="px-4 py-3">#</th>
                                <th class="px-4 py-3">個股</th>
                                <th class="px-4 py-3 text-right">淨流動</th>
                                <th class="px-4 py-3 text-right">涉及ETF</th>
                                <th class="px-4 py-3">主要ETF</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-100 dark:divide-gray-800 text-sm">
                            ${items.map((item, i) => `
                                <tr class="hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer" onclick="window.StockDetail.show('${item.stock_id}')">
                                    <td class="px-4 py-3 font-mono text-gray-400">${i + 1}</td>
                                    <td class="px-4 py-3">${stockIdentityHTML(item.stock_id, item.stock_name || item.stock_id)}</td>
                                    <td class="px-4 py-3 text-right font-mono font-bold ${color}">
                                        ${item.net_flow >= 0 ? '+' : ''}${item.net_flow.toFixed(4)}%
                                    </td>
                                    <td class="px-4 py-3 text-right text-gray-500">${item.etf_count}</td>
                                    <td class="px-4 py-3 text-xs text-gray-500 truncate max-w-[200px]">${(item.details || []).slice(0, 3).map(d => `${d.etf_name}(${d.diff >= 0 ? '+' : ''}${d.diff.toFixed(2)}%)`).join(', ')}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                `;
            }

            try {
                const data = await api.fetchLocalJson('quant/etf/outputs/etf_flow.json');
                if (!data || (!data.top_buy?.length && !data.top_sell?.length)) {
                    if (buyContainer) buyContainer.innerHTML = '<div class="text-center py-12 text-gray-500">尚無 ETF 流量數據，請先執行 ETF Pipeline</div>';
                    return;
                }
                if (buyContainer) {
                    buyContainer.innerHTML = `<div class="mb-2 text-[10px] text-gray-400 font-mono">日期: ${data.date || 'N/A'} | 基期: ${data.base_date || 'N/A'}</div>`;
                }
                renderFlowTable(data.top_buy, buyContainer, 'text-red-500');
                renderFlowTable(data.top_sell, sellContainer, 'text-green-500');
            } catch (err) {
                console.error(err);
                if (buyContainer) buyContainer.innerHTML = `<div class="text-center py-12 text-red-500">ETF 流量數據加載失敗: ${err.message}</div>`;
            }

            async function loadYearPerformance() {
                if (perfContainer?.dataset.loaded) return;
                try {
                    const data = await api.fetchLocalJson('quant/etf/outputs/etf_year_performance.json');
                    if (!data?.etfs?.length) {
                        if (perfContainer) perfContainer.innerHTML = '<div class="text-center py-8 text-gray-500">無年績效數據（需先執行 pipeline）</div>';
                        return;
                    }
                    const allEtfs = data.etfs;
                    const PAGE_SIZE = 20;
                    let currentPage = 0;

                    function renderPage(page) {
                        currentPage = page;
                        const start = page * PAGE_SIZE;
                        const slice = allEtfs.slice(start, start + PAGE_SIZE);
                        const totalPages = Math.ceil(allEtfs.length / PAGE_SIZE);

                        perfContainer.innerHTML = `
                            <div class="mb-2 text-[10px] text-gray-400 font-mono">年度: ${data.year} | 更新: ${data.date} | 共 ${allEtfs.length} 檔 ETF | 第 ${page + 1}/${totalPages} 頁</div>
                            <table class="w-full text-left">
                                <thead class="bg-gray-50/50 dark:bg-gray-900/50 text-gray-400 dark:text-gray-500 text-xs uppercase">
                                    <tr>
                                        <th class="px-4 py-3">#</th>
                                        <th class="px-4 py-3">ETF</th>
                                        <th class="px-4 py-3">類型</th>
                                        <th class="px-4 py-3 text-right">起始價</th>
                                        <th class="px-4 py-3 text-right">最新價</th>
                                        <th class="px-4 py-3 text-right">年度報酬</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-gray-100 dark:divide-gray-800 text-sm">
                                    ${slice.map((item, i) => `
                                        <tr class="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                            <td class="px-4 py-3 font-mono text-gray-400">${start + i + 1}</td>
                                            <td class="px-4 py-3">
                                                <div class="font-bold text-gray-900 dark:text-white">${item.etf_id}</div>
                                                <div class="text-[10px] text-gray-400">${item.etf_name}</div>
                                            </td>
                                            <td class="px-4 py-3 text-xs text-gray-500">${item.category}</td>
                                            <td class="px-4 py-3 text-right text-gray-500">${item.first_close}</td>
                                            <td class="px-4 py-3 text-right text-gray-500">${item.latest_close}</td>
                                            <td class="px-4 py-3 text-right font-mono font-bold ${item.return_pct >= 0 ? 'text-red-500' : 'text-green-500'}">
                                                ${item.return_pct >= 0 ? '+' : ''}${item.return_pct.toFixed(2)}%
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                            ${totalPages > 1 ? `
                            <div class="flex justify-center items-center gap-2 mt-4">
                                <button onclick="window._etfPerfPrev()" ${page === 0 ? 'disabled' : ''} class="px-3 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 ${page === 0 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-gray-100 dark:hover:bg-gray-800'}">上一頁</button>
                                <span class="text-xs text-gray-400">${page + 1} / ${totalPages}</span>
                                <button onclick="window._etfPerfNext()" ${page >= totalPages - 1 ? 'disabled' : ''} class="px-3 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 ${page >= totalPages - 1 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-gray-100 dark:hover:bg-gray-800'}">下一頁</button>
                            </div>` : ''}
                        `;
                    }

                    window._etfPerfPrev = () => { if (currentPage > 0) renderPage(currentPage - 1); };
                    window._etfPerfNext = () => { if (currentPage < Math.ceil(allEtfs.length / PAGE_SIZE) - 1) renderPage(currentPage + 1); };

                    perfContainer.dataset.loaded = '1';
                    renderPage(0);
                } catch (err) {
                    console.error(err);
                    if (perfContainer) perfContainer.innerHTML = `<div class="text-center py-12 text-red-500">年績效載入失敗: ${err.message}</div>`;
                }
            }
        }

        else if (subPage === 'ETF戰情') {
            const select = document.getElementById('etf-select');
            const tableBody = document.querySelector('#etf-holdings-table tbody');
            const metaName = document.getElementById('etf-meta-name');
            const metaCategory = document.getElementById('etf-meta-category');
            const metaCount = document.getElementById('etf-meta-count');
            const metaPremium = document.getElementById('etf-meta-premium');
            const momentumList = document.getElementById('etf-momentum-list');
            const updateTime = document.getElementById('etf-updated-time');

            try {
                // 1. Fetch Rotation for Momentum
                try {
                    const rotation = await api.fetchLocalJson('quant/theme_rotation.json');
                    if (momentumList && rotation && rotation.themes) {
                        const topThemes = rotation.themes.slice(0, 5);
                        momentumList.innerHTML = topThemes.map(t => `
                            <div class="flex justify-between items-center p-2.5 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-100 dark:border-gray-800">
                                <div class="flex items-center space-x-3">
                                    <span class="text-xs font-bold text-gray-700 dark:text-gray-300">${t.name}</span>
                                </div>
                                <div class="text-right">
                                    <div class="text-xs font-mono font-bold ${t.avg_pct >= 0 ? 'text-red-500' : 'text-green-500'}">
                                        ${t.avg_pct >= 0 ? '+' : ''}${t.avg_pct.toFixed(2)}%
                                    </div>
                                    <div class="text-[9px] text-gray-400">流入 ${t.flow_ratio.toFixed(1)}%</div>
                                </div>
                            </div>
                        `).join('');
                    }
                } catch(e) { console.warn("Rotation fetch failed", e); }

                // 🚀 Issue 7a: ETF 主題資金流
                try {
                    const etfRotation = await api.fetchLocalJson('quant/etf/outputs/rotation.json');
                    const catSummary = document.getElementById('etf-category-summary');
                    if (catSummary && etfRotation) {
                        const catLabels = {
                            index: '市值型', high_dividend: '高股息', technology: '科技型', semiconductor: '半導體',
                            ai: '人工智慧', esg: 'ESG永續', active: '主動式', bond: '債券型',
                            financial: '金融型', overseas_us: '美股型', overseas_japan: '日股型',
                            overseas_china: '中股型', overseas_india: '印度型', overseas_semiconductor: '海外半導體',
                            leveraged: '槓桿型', inverse: '反向型', gold: '黃金型', oil: '原油型'
                        };
                        const entries = Object.entries(etfRotation);
                        if (entries.length > 0) {
                            catSummary.classList.remove('hidden');
                            catSummary.innerHTML = `
                                <div class="bg-white dark:bg-[#161b22] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm p-5">
                                    <h3 class="font-bold text-gray-900 dark:text-white flex items-center mb-4 text-sm">
                                        <span class="mr-2">📊</span> ETF 主題資金流
                                    </h3>
                                    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                                        ${entries.sort((a, b) => Math.abs(b[1].avg_weight_change || 0) - Math.abs(a[1].avg_weight_change || 0)).map(([key, val]) => {
                                            const wc = val.avg_weight_change || 0;
                                            const wcPct = (wc * 100).toFixed(1);
                                            const isPos = wc >= 0;
                                            return `
                                                <div class="bg-gray-50 dark:bg-gray-900/50 p-3 rounded-xl">
                                                    <div class="text-[10px] text-gray-500 mb-1 font-medium">${catLabels[key] || key}</div>
                                                    <div class="flex items-center justify-between">
                                                        <span class="text-sm font-bold font-mono ${isPos ? 'text-red-500' : 'text-green-500'}">${isPos ? '+' : ''}${wcPct}%</span>
                                                        <span class="text-[9px] text-gray-400">${val.etf_count || 0}檔</span>
                                                    </div>
                                                    <div class="h-1 bg-gray-200 dark:bg-gray-700 rounded-full mt-2 overflow-hidden">
                                                        <div class="h-full rounded-full ${isPos ? 'bg-red-500' : 'bg-green-500'}" style="width: ${Math.min(Math.abs(wc) * 200, 100)}%"></div>
                                                    </div>
                                                </div>
                                            `;
                                        }).join('')}
                                    </div>
                                </div>
                            `;
                        }
                    }
                } catch(e) { console.warn("ETF rotation fetch failed", e); }

                // 🚀 Issue 7b: ETF 股動輪轉
                try {
                    const etfRotation = await api.fetchLocalJson('quant/etf/outputs/rotation.json');
                    const rotEl = document.getElementById('etf-rotation');
                    if (rotEl && etfRotation) {
                        const allInflows = Object.values(etfRotation).flatMap(cat => cat.top_inflow || []);
                        const uniqueInflows = [...new Set(allInflows)];
                        if (uniqueInflows.length > 0) {
                            rotEl.classList.remove('hidden');
                            rotEl.innerHTML = `
                                <div class="bg-white dark:bg-[#161b22] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm p-5">
                                    <h3 class="font-bold text-gray-900 dark:text-white flex items-center mb-4 text-sm">
                                        <span class="mr-2">🔥</span> ETF 股動輪轉
                                        <span class="ml-2 text-[10px] text-gray-500 font-normal">資金流入標的</span>
                                    </h3>
                                    <div class="overflow-x-auto">
                                        <div class="flex space-x-3 min-w-max pb-2">
                                            ${uniqueInflows.map(sym => `
                                                <div onclick="window.StockDetail.show('${sym}')" class="flex flex-col items-center justify-center p-3 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-100 dark:border-gray-800 min-w-[80px] cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800/50 transition-colors">
                                                    <span class="text-lg">📈</span>
                                                    <span class="text-xs font-bold mt-1 text-gray-900 dark:text-white">${sym}</span>
                                                </div>
                                            `).join('')}
                                        </div>
                                    </div>
                                </div>
                            `;
                        }
                    }
                } catch(e) { console.warn("ETF rotation inflow fetch failed", e); }

                // 🚀 Issue 7c: ETF 換股動向
                try {
                    const rebalance = await api.fetchLocalJson('quant/etf/outputs/rebalance.json');
                    const rebEl = document.getElementById('etf-rebalance');
                    if (rebEl && rebalance) {
                        const rebEntries = Object.entries(rebalance).filter(([, v]) => (v.added && v.added.length) || (v.removed && v.removed.length) || (v.weight_up && v.weight_up.length) || (v.weight_down && v.weight_down.length));
                        if (rebEntries.length > 0) {
                            rebEl.classList.remove('hidden');
                            rebEl.innerHTML = `
                                <div class="bg-white dark:bg-[#161b22] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm p-5">
                                    <h3 class="font-bold text-gray-900 dark:text-white flex items-center mb-4 text-sm">
                                        <span class="mr-2">🔄</span> ETF 換股動向
                                        <span class="ml-2 text-[10px] text-gray-500 font-normal">最近異動</span>
                                    </h3>
                                    <div class="overflow-x-auto">
                                        <div class="flex space-x-4 min-w-max pb-2">
                                            ${rebEntries.map(([etfID, reb]) => `
                                                <div class="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-100 dark:border-gray-800 min-w-[160px] max-w-[200px]">
                                                    <div class="font-bold text-xs text-gray-900 dark:text-white mb-2">${reb.name || etfID}</div>
                                                    ${reb.added && reb.added.length ? `
                                                        <div class="mb-2">
                                                            <span class="text-[10px] font-bold text-red-500">✦ 新進</span>
                                                            <div class="flex flex-wrap gap-1 mt-1">
                                                                ${reb.added.slice(0, 4).map(s => `<span class="text-[9px] font-mono bg-red-500/10 text-red-500 px-1.5 py-0.5 rounded">${s}</span>`).join('')}
                                                            </div>
                                                        </div>
                                                    ` : ''}
                                                    ${reb.removed && reb.removed.length ? `
                                                        <div class="mb-2">
                                                            <span class="text-[10px] font-bold text-green-500">✧ 剔除</span>
                                                            <div class="flex flex-wrap gap-1 mt-1">
                                                                ${reb.removed.slice(0, 4).map(s => `<span class="text-[9px] font-mono bg-green-500/10 text-green-500 px-1.5 py-0.5 rounded">${s}</span>`).join('')}
                                                            </div>
                                                        </div>
                                                    ` : ''}
                                                    ${reb.weight_up && reb.weight_up.length ? `
                                                        <div class="mb-2">
                                                            <span class="text-[10px] font-bold text-blue-500">↑ 權重增</span>
                                                            <div class="flex flex-wrap gap-1 mt-1">
                                                                ${reb.weight_up.slice(0, 3).map(w => `<span class="text-[9px] font-mono bg-blue-500/10 text-blue-500 px-1.5 py-0.5 rounded">${w.stock_id} +${w.diff.toFixed(1)}</span>`).join('')}
                                                            </div>
                                                        </div>
                                                    ` : ''}
                                                    ${reb.weight_down && reb.weight_down.length ? `
                                                        <div>
                                                            <span class="text-[10px] font-bold text-orange-500">↓ 權重減</span>
                                                            <div class="flex flex-wrap gap-1 mt-1">
                                                                ${reb.weight_down.slice(0, 3).map(w => `<span class="text-[9px] font-mono bg-orange-500/10 text-orange-500 px-1.5 py-0.5 rounded">${w.stock_id} ${w.diff.toFixed(1)}</span>`).join('')}
                                                            </div>
                                                        </div>
                                                    ` : ''}
                                                </div>
                                            `).join('')}
                                        </div>
                                    </div>
                                </div>
                            `;
                        }
                    }
                } catch(e) { console.warn("ETF rebalance fetch failed", e); }

                const data = await api.fetchLocalJson('quant/etf/outputs/latest_snapshot.json');
                let etfs = [];
                if (data && data.etfs) {
                    etfs = data.etfs;
                } else if (data) {
                    etfs = Object.entries(data).map(([symbol, detail]) => ({
                        symbol: symbol,
                        name: detail.name || symbol,
                        category: detail.category,
                        updated_at: detail.updated_at,
                        holdings: detail.holdings || []
                    }));
                }

                if (etfs.length === 0) {
                    if (select) select.innerHTML = `<option value="">無 ETF 數據</option>`;
                    if (tableBody) tableBody.innerHTML = `<tr><td colspan="4" class="px-6 py-8 text-center text-gray-500">無可用的 ETF 數據</td></tr>`;
                    return;
                }

                if (select) {
                    select.innerHTML = `<option value="">-- 請選擇 ETF --</option>` +
                        etfs.map(e => `<option value="${e.symbol}">${e.symbol} - ${e.name}</option>`).join('');

                    select.addEventListener('change', (e) => {
                        const sym = e.target.value;
                        if (!sym) {
                            if (tableBody) tableBody.innerHTML = `<tr><td colspan="4" class="px-6 py-8 text-center text-gray-500">請先選擇欲查看的 ETF</td></tr>`;
                            return;
                        }

                        const etf = etfs.find(e => e.symbol === sym);
                        if (!etf) {
                            if (tableBody) tableBody.innerHTML = `<tr><td colspan="4" class="px-6 py-8 text-center text-gray-500">請先選擇欲查看的 ETF</td></tr>`;
                            return;
                        }

                        if (metaName) metaName.textContent = etf.name;
                        if (metaCategory) metaCategory.textContent = etf.category || '市值型';
                        if (metaCount) metaCount.textContent = `${etf.holdings?.length || 0} 檔`;
                        if (metaPremium) metaPremium.textContent = `${(Math.random() * 0.4 - 0.2).toFixed(2)}%`; // Placeholder for premium
                        if (updateTime) updateTime.textContent = `Update: ${etf.updated_at || new Date().toISOString().split('T')[0]}`;

                        if (tableBody) {
                            const holdings = etf.holdings || [];
                            if (holdings.length === 0) {
                                tableBody.innerHTML = `<tr><td colspan="4" class="px-6 py-8 text-center text-gray-500">無成分股權重數據</td></tr>`;
                            } else {
                                const sortedHoldings = [...holdings].sort((a, b) => (b.weight || 0) - (a.weight || 0)).slice(0, 50);
                                tableBody.innerHTML = sortedHoldings.map(h => {
                                    const constituentName = h.name || h.stock_name || '--';
                                    return `
                                        <tr class="hover:bg-gray-50 dark:hover:bg-gray-900/30 transition-colors">
                                            <td class="px-6 py-3" colspan="2">${stockIdentityHTML(h.stock_id, constituentName)}</td>
                                            <td class="px-6 py-3 text-right font-bold text-blue-600 dark:text-blue-400 font-mono">${(h.weight || 0).toFixed(2)}%</td>
                                            <td class="px-6 py-3 text-right">
                                                <button class="px-3 py-1 bg-blue-500/10 hover:bg-blue-500 text-blue-600 hover:text-white border border-blue-500/20 rounded-lg text-xs font-bold transition-all"
                                                        onclick="window.StockDetail.show('${h.stock_id}')">
                                                    查看
                                                </button>
                                            </td>
                                        </tr>
                                    `;
                }).join('');
                            }
                        }

                        // 🚀 Issue 8: ETF 圓餅圖
                        const pieContainer = document.getElementById('etf-pie-chart');
                        if (pieContainer) {
                            if (window.etfPieChartInstance) window.etfPieChartInstance.dispose();
                            const allHoldings = etf.holdings || [];
                            if (allHoldings.length > 0) {
                                pieContainer.classList.remove('hidden');
                                const sorted = [...allHoldings].sort((a, b) => (b.weight || 0) - (a.weight || 0));
                                const top10 = sorted.slice(0, 10);
                                const others = sorted.slice(10);
                                const othersWeight = others.reduce((s, h) => s + (h.weight || 0), 0);
                                const pieDom = document.createElement('div');
                                pieDom.style.width = '100%';
                                pieDom.style.height = '100%';
                                pieContainer.innerHTML = '';
                                pieContainer.appendChild(pieDom);
                                setTimeout(() => {
                                    if (!pieContainer.contains(pieDom)) return;
                                    const isDark = document.documentElement.classList.contains('dark');
                                    const chart = echarts.init(pieDom, isDark ? 'dark' : null);
                                    window.etfPieChartInstance = chart;
                                    const pieData = top10.map(h => {
                                        const code = h.stock_id || h.symbol || '';
                                        const displayName = h.stock_name || h.name || code;
                                        return { name: code ? `${code} ${displayName}` : displayName, value: h.weight || 0 };
                                    });
                                    if (othersWeight > 0) pieData.push({ name: '其他', value: othersWeight });
                                    chart.setOption({
                                        backgroundColor: 'transparent',
                                        tooltip: { trigger: 'item', formatter: '{b}: {c}%' },
                                        series: [{
                                            type: 'pie', radius: ['30%', '60%'], center: ['50%', '50%'],
                                            data: pieData,
                                            label: { fontSize: 10, formatter: '{b}\n{d}%' },
                                            itemStyle: { borderRadius: 4 }
                                        }]
                                    });
                                    window.addEventListener('resize', () => chart.resize());
                                }, 100);
                            } else {
                                pieContainer.classList.add('hidden');
                            }
                        }
                    });

                    // Select first one by default if exists
                    if (etfs.length > 0) {
                        select.value = etfs[0].symbol;
                        select.dispatchEvent(new Event('change'));
                    }
                }
            } catch (err) {
                console.error("ETF 戰情載入失敗:", err);
                const container = document.getElementById('etf-container');
                if (container) {
                    container.innerHTML = `<div class="text-center text-red-500 py-8">資料加載失敗: ${err.message}</div>`;
                }
            }
        }
    }
};
window.TrendHunter = TrendHunter;
