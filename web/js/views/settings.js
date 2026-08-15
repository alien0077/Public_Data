import { api } from '../api.js';
import { db } from '../db.js';
import { StockListPreferences, stockListColumnSettingsHTML } from '../utils/stockListPreferences.js';

export const Settings = {
    async init() {
        const container = document.getElementById('view-settings');
        if (!container) return;
        this.render(container);
        this.bindEvents();
    },

    render(container) {
        const selectedTheme = window.ThemeEngine?.preference?.() || 'system';
        const themeOptions = [
            { mode: 'system', icon: '🖥️', title: '系統', description: '跟隨裝置外觀設定' },
            { mode: 'light', icon: '☀️', title: '淺色', description: '固定使用明亮介面' },
            { mode: 'dark', icon: '🌙', title: '深色', description: '固定使用深色介面' }
        ];
        const themeButtons = themeOptions.map(option => {
            const isSelected = selectedTheme === option.mode;
            const classes = isSelected
                ? 'border-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-300 ring-2 ring-blue-500/20'
                : 'border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 text-gray-600 dark:text-gray-300 hover:border-blue-300 dark:hover:border-blue-700';
            const checkmark = isSelected
                ? '<span class="ml-auto text-blue-500 text-sm font-bold">✓</span>'
                : '<span class="ml-auto w-4"></span>';
            return `
                <button type="button" data-theme-mode="${option.mode}" aria-pressed="${isSelected}"
                    class="settings-theme-option flex items-center gap-3 rounded-xl border p-3 text-left transition-all ${classes}">
                    <span class="text-xl flex-shrink-0">${option.icon}</span>
                    <span class="min-w-0">
                        <span class="block text-sm font-bold text-gray-900 dark:text-white">${option.title}</span>
                        <span class="block text-xs text-gray-500 dark:text-gray-400">${option.description}</span>
                    </span>
                    ${checkmark}
                </button>
            `;
        }).join('');

        container.innerHTML = `
            <div class="flex flex-col flex-1 overflow-y-auto no-scrollbar p-4 md:p-6 space-y-6">
                <!-- 外觀設定 -->
                <div class="bg-white dark:bg-[#161b22] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
                    <div class="p-5 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50">
                        <h3 class="font-bold text-gray-900 dark:text-white flex items-center">
                            <span class="mr-2">🎨</span> 外觀設定
                        </h3>
                    </div>
                    <div class="p-5">
                        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            ${themeButtons}
                        </div>
                    </div>
                </div>

                <!-- 個股列表欄位 -->
                <div class="bg-white dark:bg-[#161b22] rounded-2xl border border-blue-200 dark:border-blue-900/50 shadow-sm overflow-hidden">
                    <div class="p-5 border-b border-blue-100 dark:border-blue-900/40 bg-blue-50/50 dark:bg-blue-900/10">
                        <h3 class="font-bold text-gray-900 dark:text-white flex items-center">
                            <span class="mr-2">📋</span> 個股列表欄位
                        </h3>
                        <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">固定股票身份欄；右側欄位可左右滑動。每個分頁可獨立選擇顯示欄位。</p>
                    </div>
                    <div id="stock-list-column-settings" class="p-5 space-y-2">
                        ${stockListColumnSettingsHTML()}
                    </div>
                </div>

                <!-- 公允價算法 -->
                <div id="fair-value-methodology" class="bg-white dark:bg-[#161b22] rounded-2xl border border-orange-200 dark:border-orange-900/50 shadow-sm overflow-hidden">
                    <div class="p-5 border-b border-orange-100 dark:border-orange-900/40 bg-orange-50/50 dark:bg-orange-900/10">
                        <div class="flex items-start justify-between gap-3">
                            <div>
                                <h3 class="font-bold text-gray-900 dark:text-white flex items-center">
                                    <span class="mr-2">📐</span> 公允價算法
                                </h3>
                                <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">FV-1.16 目前執行 · 非固定 P/E=20</p>
                            </div>
                            <span class="shrink-0 rounded-full bg-orange-500/10 px-2 py-1 text-[10px] font-bold text-orange-500">可追溯模型</span>
                        </div>
                    </div>
                    <div class="p-5 space-y-3 text-xs text-gray-600 dark:text-gray-300">
                        <p>公允價是可取得且可追溯模型的集合，不是保證價格。每次更新會保存資料日期、模型、合理區間、模型分歧與資料品質；缺資料時顯示資料不足，不猜一個價格。</p>

                        <details class="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden" open>
                            <summary class="cursor-pointer bg-gray-50/70 dark:bg-gray-900/50 px-4 py-3 font-bold text-gray-900 dark:text-white">一、輸入變數是什麼？</summary>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-3 p-4 border-t border-gray-200 dark:border-gray-700">
                                <div><b>TTM EPS</b><br><span>最近四季每股盈餘；Q4 先扣除同年度 Q1–Q3，避免把全年 EPS 當成單季。</span></div>
                                <div><b>BVPS</b><br><span>每股帳面淨值，代表最新財報中的每股股東權益。</span></div>
                                <div><b>ROE</b><br><span>Residual Income 使用 TTM EPS ÷ 最新 BVPS 的可稽核代理值；季度公告 ROE 是單季指標，只作觀察，不直接當作長期終值 ROE。</span></div>
                                <div><b>raw close</b><br><span>未還原的最新收盤價，只用於現價與公允價比較，不使用 adj_close。</span></div>
                                <div><b>月營收</b><br><span>已公告月營收；完整下一季度營收可用於近端 EPS nowcast。</span></div>
                                <div><b>DPS / payout</b><br><span>DPS 是最近一年每股現金股利；payout 是現金股利 ÷ 估值 EPS。</span></div>
                                <div><b>Beta</b><br><span>個股相對加權指數的系統性波動，使用最近約 252 個共同交易日報酬。</span></div>
                                <div><b>無風險利率</b><br><span>中央銀行基準資料；API 失敗時使用有日期標記的 fallback。</span></div>
                                <div><b>ERP</b><br><span>市場股權風險溢酬，代表股票相對無風險資產要求的額外報酬。</span></div>
                                <div><b>Ke</b><br><span>股東要求報酬率：無風險利率 + Beta × ERP。</span></div>
                                <div><b>終值成長率 g</b><br><span>長期可持續成長率，來自 World Bank 名目 GDP 成長序列，不是短期題材成長率。</span></div>
                            </div>
                        </details>

                        <details class="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                            <summary class="cursor-pointer bg-gray-50/70 dark:bg-gray-900/50 px-4 py-3 font-bold text-gray-900 dark:text-white">二、目前已執行的估值模型</summary>
                            <div class="space-y-3 p-4 border-t border-gray-200 dark:border-gray-700">
                                <div><b>Residual Income（剩餘收益）</b><br><code>公允價 = BVPS + 未來剩餘收益折現值 + 終值折現值</code><br><span>剩餘收益 = EPS − Ke × 期初帳面價值。</span></div>
                                <div><b>EPS 成長情境</b><br><span>依歷史同季 EPS 年增率建立 Bear／Base／Bull，五年內逐步收斂至長期 g，不把短期成長永久延續。</span></div>
                                <div><b>Revenue-anchored EPS nowcast</b><br><code>近端預估 EPS = 最新公告季度 EPS × 下一季度營收 ÷ 最新財報季度營收</code><br><span>只替換 TTM 中最舊季度，且標記為 provisional，並非公司正式公告 EPS。</span></div>
                                <div><b>正常化 EPS 與細分同業</b><br><span>有至少兩個完整年度時，取最多五年年度 EPS 中位數；若 TTM 處於週期極端才改用正常化 EPS。只有兩年標記短歷史並維持低信心。P/E、P/B 優先使用 industry_node／primary_theme，同業倍數先裁切第 10～90 百分位極端值。</span></div>
                                <div><b>同業 P/E、P/B</b><br><span>至少五個有效同業後，取裁切後倍數第 25／50／75 百分位建立 Bear／Base／Bull；不使用固定倍數。</span></div>
                                <div><b>DDM</b><br><span>有現金股利且 Ke 大於成長率時才折現股利；沒有可靠股利不硬套。</span></div>
                            </div>
                        </details>

                        <details class="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                            <summary class="cursor-pointer bg-gray-50/70 dark:bg-gray-900/50 px-4 py-3 font-bold text-gray-900 dark:text-white">三、模型集合、訊號與品質</summary>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-3 p-4 border-t border-gray-200 dark:border-gray-700">
                                <div><b>公允價中樞</b><br><span>以模型基礎值的加權算術平均整合：Residual Income 45%、DDM 25%、P/B 20%、P/E 20%、前瞻 EPS 10%。若採正常化 EPS，ROE 也同步改用正常化 EPS ÷ BVPS；符合前瞻成長條件時另顯示基準、結構性成長與牛市價格。</span></div>
                                <div><b>合理區間</b><br><span>多模型取加權 Base 值第 25／75 百分位；區間越寬代表模型分歧越大。</span></div>
                                <div><b>低估／高估</b><br><span>現價低於下緣為低估（紅色）；高於上緣為高估（綠色）；區間內為合理（橘色）。</span></div>
                                <div><b>model spread</b><br><span>(區間上緣 − 下緣) ÷ 公允價中樞，衡量模型分歧，不是報酬率。</span></div>
                                <div><b>confidence</b><br><span>資料完整度與前瞻假設強度，不是上漲機率，也不代表模型一定正確。</span></div>
                                <div><b>資料狀態</b><br><span>complete=主要內在模型完整；provisional=含速報或營收 nowcast；partial fallback=替代模型；insufficient=無法追溯估值。</span></div>
                            </div>
                        </details>

                        <details class="rounded-xl border border-blue-200 dark:border-blue-900/50 overflow-hidden">
                            <summary class="cursor-pointer bg-blue-50/70 dark:bg-blue-900/10 px-4 py-3 font-bold text-gray-900 dark:text-white">四、FV-1.16 景氣反轉、前瞻 EPS 與市場隱含預期（目前執行）</summary>
                            <div class="space-y-3 p-4 border-t border-blue-200 dark:border-blue-900/50">
                                <p>目前會先把單季 EPS 轉成連續 TTM EPS 序列，再以最近 6–8 個 TTM EPS 做後期權重較高的線性趨勢；若有至少四個重疊季度，另以「已公告營收 × 觀察到的 EPS／營收強度」交叉檢查，最後用同業 P/E 評價 2027／2028 EPS，再以 Ke 折現回今天。資料不足時不猜一個淨利率。</p>
                                <div><b>Bear／Base／Bull</b><br><span>Base 使用加權線性趨勢；Bear／Bull 使用最近 TTM EPS 季增變化的第 25／75 百分位；少於六個連續 TTM 觀測點不做線性外插。</span></div>
                                <div><b>官方公告優先</b><br><span>公司正式公告 EPS 可由 data/earnings_updates/latest.json 以來源、公告期間、日期與信心度輸入；同季度較新的有證據公告可取代舊正式資料，較舊或無證據公告會被拒絕。這是全市場共用的資料優先序，不是單一股票價格覆寫。</span></div>
                                <div><b>景氣反轉 EPS</b><br><span>若最近兩個正 EPS 季度依序改善超過 25%，且兩季年化 run-rate 超過正常化 EPS 1.5 倍，估值 EPS 使用 50% 最新 TTM + 50% 兩季年化 run-rate；條件不足不啟用。</span></div>
                                <div><b>反轉類模型限制</b><br><span>景氣反轉類停用低谷同業 P/E 及其衍生前瞻模型，保留 Residual Income 與相對 P/B，避免低谷分母製造假性高估；啟用條件與季度會寫入 detail。</span></div>
                                <div><b>防止本夢比</b><br><span>不把 2027／2028 高成長永久延續；沒有公告、營收加速、利潤率或產業導入證據時，只列低信心，不覆蓋基本面公允價。</span></div>
                                <div><b>雙層輸出</b><br><span>保留目前基本面公允價與前瞻情境價，讓已實現獲利與未來選擇權分開。</span></div>
                                <div><b>品質診斷</b><br><span>輸出 TTM ROE、單季 ROE、ROE 使用基礎與修正動作；若公允價相對現價極端或模型分歧超過 100%，標記警示供複核。</span></div>
                                <div><b>模型收斂閘門</b><br><span>Residual Income／DDM 只有在 Ke − g 至少 2% 時使用；終值 ROE 以 Ke + 25% × (TTM ROE − Ke) 回歸；虧損或 2028 EPS 低於最新 TTM EPS 25% 的前瞻模型停用。</span></div>
                                <div><b>外插與相對模型閘門</b><br><span>前瞻 EPS 每個情境最多為最新 TTM 的 2.5 倍，且在中樞只占 10%；DDM 需至少 1% 現金股利殖利率；P/B 需 BVPS 至少 1 元；最新 TTM EPS 非正時不以營收 nowcast 冒充 P/E 分母。</span></div>
                                <div><b>模型異常值閘門</b><br><span>至少四個模型時，排除異常爆高的模型；一般相對模型若低於其他模型中位數 0.25 倍也會排除，但 Residual Income／DDM 的低估值會保留，因為可能代表同業整體被炒高。只有三個模型時完整保留並顯示 model_spread。</span></div>
                                <div><b>稽核分類</b><br><span>實際排除模型列為 model_anomalies；模型 Base 差距超過 100% 另列 model_disagreements，表示降低信心，不直接宣稱公式錯誤；現價比較則另列 market_signals。</span></div>
                                <div><b>市場隱含預期</b><br><span>現價只反算現價 P/E、現價／公允價及同業 P/E 下需要的 2028 EPS，不回饋公允價，避免用股價自我證明股價合理。</span></div>
                            </div>
                        </details>

                        <p class="rounded-xl bg-orange-500/10 p-3 font-medium text-orange-600 dark:text-orange-300">同步規則：公式、資料來源、門檻、訊號或資料狀態只要改變，必須同步更新估值程式、docs/fair_value_methodology.md、iOS AboutView 與 Web 設定頁，並更新說明版本。</p>
                    </div>
                </div>

                <!-- 資料管理 -->
                <div class="bg-white dark:bg-[#161b22] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
                    <div class="p-5 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50">
                        <h3 class="font-bold text-gray-900 dark:text-white flex items-center">
                            <span class="mr-2">📂</span> 資料管理
                        </h3>
                    </div>
                    <div class="p-5 space-y-4">
                        <div>
                            <p class="text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">📈 交易相關</p>
                            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <button id="settings-import-trades" class="flex items-center justify-center space-x-2 p-3 bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 rounded-xl border border-blue-500/20 transition-all">
                                    <span>📥</span>
                                    <span class="text-sm font-bold">匯入交易備份(JSON)</span>
                                </button>
                                <button id="settings-export-trades" class="flex items-center justify-center space-x-2 p-3 bg-green-500/10 hover:bg-green-500/20 text-green-500 rounded-xl border border-green-500/20 transition-all">
                                    <span>📤</span>
                                    <span class="text-sm font-bold">導出交易備份(JSON)</span>
                                </button>
                                <button id="settings-clear-trades" class="flex items-center justify-center space-x-2 p-3 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-xl border border-red-500/20 transition-all">
                                    <span>🗑️</span>
                                    <span class="text-sm font-bold">清空所有交易紀錄</span>
                                </button>
                            </div>
                        </div>
                        <div>
                            <p class="text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">⭐ 收藏相關</p>
                            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <button id="settings-import-fav" class="flex items-center justify-center space-x-2 p-3 bg-purple-500/10 hover:bg-purple-500/20 text-purple-500 rounded-xl border border-purple-500/20 transition-all">
                                    <span>📥</span>
                                    <span class="text-sm font-bold">匯入收藏名單(JSON)</span>
                                </button>
                                <button id="settings-export-fav" class="flex items-center justify-center space-x-2 p-3 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-500 rounded-xl border border-indigo-500/20 transition-all">
                                    <span>📤</span>
                                    <span class="text-sm font-bold">導出收藏名單(JSON)</span>
                                </button>
                                <button id="settings-clear-fav" class="flex items-center justify-center space-x-2 p-3 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-xl border border-red-500/20 transition-all">
                                    <span>🗑️</span>
                                    <span class="text-sm font-bold">清空收藏名單</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 系統資訊 -->
                <div class="bg-white dark:bg-[#161b22] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
                    <div class="p-5 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50">
                        <h3 class="font-bold text-gray-900 dark:text-white flex items-center">
                            <span class="mr-2">ℹ️</span> 系統資訊
                        </h3>
                    </div>
                    <div class="p-5 space-y-3">
                        <div class="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-100 dark:border-gray-800">
                            <span class="text-sm text-gray-500">作者</span>
                            <span class="text-sm font-bold text-gray-900 dark:text-white">Alien</span>
                        </div>
                        <div class="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-100 dark:border-gray-800">
                            <span class="text-sm text-gray-500">App版本</span>
                            <span class="text-sm font-bold text-gray-900 dark:text-white">V2.1.0</span>
                        </div>
                        <div class="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-100 dark:border-gray-800">
                            <span class="text-sm text-gray-500">更新日期</span>
                            <span class="text-sm font-bold text-gray-900 dark:text-white">${new Date().toISOString().split('T')[0]}</span>
                        </div>
                    </div>
                </div>

                <!-- 匯入格式參考 -->
                <div class="bg-white dark:bg-[#161b22] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
                    <div class="p-5 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50">
                        <h3 class="font-bold text-gray-900 dark:text-white flex items-center">
                            <span class="mr-2">📄</span> 匯入格式參考
                        </h3>
                    </div>
                    <div class="p-5 space-y-4">
                        <div class="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                            <button onclick="this.nextElementSibling.classList.toggle('hidden');this.querySelector('.arrow').classList.toggle('rotate-90')"
                                class="w-full flex items-center justify-between p-4 text-sm font-bold text-gray-900 dark:text-white bg-gray-50/50 dark:bg-gray-900/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                                <span>📈 交易紀錄 JSON 格式</span>
                                <span class="arrow text-gray-500 transition-transform">▸</span>
                            </button>
                            <div class="hidden p-4 border-t border-gray-200 dark:border-gray-700">
                                <p class="text-xs text-gray-500 mb-3">匯入時自動辨識以下三種格式（優先序從上到下）：</p>

                                <div class="mb-3">
                                    <p class="text-xs font-bold text-gray-400 mb-1">格式一：transactions 陣列（推薦）</p>
                                    <pre class="text-xs font-mono text-gray-300 bg-gray-900 rounded-lg p-3 overflow-x-auto"><span class="text-gray-500">{</span>
    <span class="text-blue-400">"transactions"</span>: [
        {
            <span class="text-blue-400">"symbol"</span>: <span class="text-green-400">"2330"</span>,
            <span class="text-blue-400">"name"</span>: <span class="text-green-400">"台積電"</span>,
            <span class="text-blue-400">"type"</span>: <span class="text-green-400">"買入"</span>,
            <span class="text-blue-400">"date"</span>: <span class="text-green-400">"2025-03-15"</span>,
            <span class="text-blue-400">"shares"</span>: <span class="text-yellow-400">1000</span>,
            <span class="text-blue-400">"price"</span>: <span class="text-yellow-400">150.5</span>,
            <span class="text-blue-400">"fee"</span>: <span class="text-yellow-400">90.3</span>,
            <span class="text-blue-400">"tax"</span>: <span class="text-yellow-400">0</span>
        }
    ]
<span class="text-gray-500">}</span></pre>
                                </div>

                                <div class="mb-3">
                                    <p class="text-xs font-bold text-gray-400 mb-1">格式二：純陣列</p>
                                    <pre class="text-xs font-mono text-gray-300 bg-gray-900 rounded-lg p-3 overflow-x-auto">[<span class="text-gray-500">...</span>]</pre>
                                </div>

                                <div class="mb-3">
                                    <p class="text-xs font-bold text-gray-400 mb-1">格式三：iOS 完整備份（含 normalizedTrades）</p>
                                    <pre class="text-xs font-mono text-gray-300 bg-gray-900 rounded-lg p-3 overflow-x-auto"><span class="text-gray-500">{</span>
    <span class="text-blue-400">"transactions"</span>: [<span class="text-gray-500">...</span>],
    <span class="text-blue-400">"normalizedTrades"</span>: [<span class="text-gray-500">...</span>]
<span class="text-gray-500">}</span></pre>
                                </div>

                                <div class="bg-blue-500/10 rounded-lg p-3">
                                    <p class="text-xs text-blue-400 font-bold mb-1">必要欄位</p>
                                    <p class="text-xs text-gray-400"><span class="text-blue-300">symbol</span> (股票代號) · <span class="text-blue-300">type</span> (買入/賣出/配息/配股) · <span class="text-blue-300">date</span> (交易日期) · <span class="text-blue-300">shares</span> (股數) · <span class="text-blue-300">price</span> (價格)</p>
                                    <p class="text-xs text-blue-400 font-bold mt-2">選填欄位</p>
                                    <p class="text-xs text-gray-400"><span class="text-blue-300">name</span> · <span class="text-blue-300">fee</span> (手續費) · <span class="text-blue-300">tax</span> (交易稅) · <span class="text-blue-300">notes</span> (備註)</p>
                                </div>
                            </div>
                        </div>

                        <div class="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                            <button onclick="this.nextElementSibling.classList.toggle('hidden');this.querySelector('.arrow').classList.toggle('rotate-90')"
                                class="w-full flex items-center justify-between p-4 text-sm font-bold text-gray-900 dark:text-white bg-gray-50/50 dark:bg-gray-900/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                                <span>⭐ 收藏名單 JSON 格式</span>
                                <span class="arrow text-gray-500 transition-transform">▸</span>
                            </button>
                            <div class="hidden p-4 border-t border-gray-200 dark:border-gray-700">
                                <div class="mb-3">
                                    <p class="text-xs font-bold text-gray-400 mb-1">收藏名單（Web / iOS 互通）</p>
                                    <pre class="text-xs font-mono text-gray-300 bg-gray-900 rounded-lg p-3 overflow-x-auto"><span class="text-gray-500">{</span>
    <span class="text-blue-400">"version"</span>: <span class="text-yellow-400">1</span>,
    <span class="text-blue-400">"categories"</span>: {
        <span class="text-green-400">"我的最愛"</span>: [<span class="text-green-400">"2330"</span>, <span class="text-green-400">"2317"</span>],
        <span class="text-green-400">"觀察中"</span>: [<span class="text-green-400">"2454"</span>]
    }
<span class="text-gray-500">}</span></pre>
                                </div>
                                <div class="bg-purple-500/10 rounded-lg p-3">
                                    <p class="text-xs text-purple-400 font-bold mb-1">說明</p>
                                    <p class="text-xs text-gray-400">categories 的 key 為分類名稱，value 為股票代號字串陣列。分類可自行命名，數量不限。</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Footer -->
                <div class="text-center text-xs text-gray-500 py-4 border-t border-gray-100 dark:border-gray-800">
                    © 2024-2026 Alien. All rights reserved.
                </div>
            </div>
        `;
    },

    bindEvents() {
        document.querySelectorAll('.settings-theme-option').forEach((button) => {
            button.addEventListener('click', () => {
                const mode = button.dataset.themeMode;
                window.ThemeEngine?.set(mode);
                const container = document.getElementById('view-settings');
                if (container) {
                    this.render(container);
                    this.bindEvents();
                }
            });
        });

        document.getElementById('settings-import-trades')?.addEventListener('click', () => {
            document.getElementById('trigger-import')?.click();
        });

        document.getElementById('settings-export-trades')?.addEventListener('click', () => {
            if (typeof window.exportTrades === 'function') {
                window.exportTrades();
            }
        });

        document.getElementById('settings-clear-trades')?.addEventListener('click', async () => {
            if (confirm('確定要清空所有交易紀錄嗎？此操作無法復原！')) {
                await db.clearAllTrades();
                alert('已清空所有交易紀錄');
                window.dispatchEvent(new CustomEvent('twstock:data-changed'));
            }
        });

        document.getElementById('settings-import-fav')?.addEventListener('click', () => {
            this.importFavorites();
        });
        document.getElementById('settings-export-fav')?.addEventListener('click', () => {
            this.exportFavorites();
        });
        document.getElementById('settings-clear-fav')?.addEventListener('click', () => {
            this.clearFavorites();
        });

        document.querySelectorAll('.stock-column-toggle').forEach((input) => {
            input.addEventListener('change', () => {
                StockListPreferences.set(input.dataset.stockColumnPage, input.dataset.stockColumn, input.checked);
                const container = document.getElementById('view-settings');
                if (container) {
                    this.render(container);
                    this.bindEvents();
                }
            });
        });

        document.querySelectorAll('[data-stock-column-reset]').forEach((button) => {
            button.addEventListener('click', () => {
                StockListPreferences.reset(button.dataset.stockColumnReset);
                const container = document.getElementById('view-settings');
                if (container) {
                    this.render(container);
                    this.bindEvents();
                }
            });
        });
    },

    exportFavorites() {
        const data = {
            categories: JSON.parse(localStorage.getItem('twstock_favorite_categories') || '["我的最愛","觀察中","定存股","潛力股","投機短線"]'),
            items: JSON.parse(localStorage.getItem('twstock_favorite_data') || '{}'),
            exportedAt: new Date().toISOString()
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${new Date().toISOString().slice(0, 10)}_收藏.json`;
        a.click();
        URL.revokeObjectURL(url);
    },

    importFavorites() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            try {
                const text = await file.text();
                const data = JSON.parse(text);

                // 收藏頁 v1 格式: { version: 1, categories: { "name": ["stocks"] } }
                if (data.version === 1 && data.categories) {
                    const catNames = Object.keys(data.categories);
                    const totalStocks = catNames.reduce((s, c) => s + (data.categories[c] || []).length, 0);
                    if (!confirm(`將以匯入的分類 (${catNames.length} 個) 完全取代現有收藏，共 ${totalStocks} 檔股票。確定？`)) return;
                    localStorage.setItem('twstock_favorite_categories', JSON.stringify(catNames));
                    localStorage.setItem('twstock_favorite_data', JSON.stringify(data.categories));
                    alert(`✅ 匯入完成！共 ${totalStocks} 檔股票，${catNames.length} 個分類。`);
                    return;
                }

                // 舊格式: { categories: ["names"], items: { "stock": ["cats"] } }
                if (data.categories && data.items) {
                    localStorage.setItem('twstock_favorite_categories', JSON.stringify(data.categories));
                    localStorage.setItem('twstock_favorite_data', JSON.stringify(data.items));
                    alert('收藏名單匯入成功！');
                    return;
                }

                alert('無效的收藏名單格式。');
            } catch { alert('解析 JSON 失敗。'); }
        });
        input.click();
    },

    clearFavorites() {
        if (confirm('確定要清空所有收藏名單嗎？此操作無法復原！')) {
            localStorage.removeItem('twstock_favorite_categories');
            localStorage.removeItem('twstock_favorite_data');
            alert('已清空收藏名單');
        }
    }
};

window.Settings = Settings;
