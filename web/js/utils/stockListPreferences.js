const STORAGE_KEY = 'twstock_stock_list_columns_v1';

export const STOCK_LIST_COLUMNS = {
    COST_SHARES: 'cost_shares',
    CURRENT_CHANGE: 'current_change',
    FAIR_VALUE: 'fair_value',
    PROFIT_RETURN: 'profit_return',
    SECTOR: 'sector',
    START_DAYS: 'start_days',
    ACCUMULATED_BUY: 'accumulated_buy',
    INSTITUTIONAL_FLOW: 'institutional_flow',
    QUADRANT: 'quadrant',
    BUY_DAYS: 'buy_days',
    PE: 'pe',
    EPS: 'eps',
    EVALUATION: 'evaluation',
    SIGNAL: 'signal',
    SCORE_RETURN: 'score_return',
    TOP_RANK: 'top_rank'
};

// 備註是法人列表的固定輔助欄位，不納入使用者勾選欄位，但仍套用共用欄寬規則。
const STOCK_LIST_AUXILIARY_COLUMNS = {
    NOTE: 'note'
};

export const STOCK_LIST_PAGES = {
    PORTFOLIO: 'portfolio',
    INSTITUTIONAL: 'institutional',
    RAPID_SCREEN: 'rapid_screen',
    SECTOR_PE: 'sector_pe',
    QUANT: 'quant',
    HOTTEST: 'hottest',
    FAVORITES: 'favorites'
};

export const STOCK_LIST_DEFINITIONS = [
    { page: STOCK_LIST_PAGES.PORTFOLIO, title: '未結算持股', columns: [STOCK_LIST_COLUMNS.COST_SHARES, STOCK_LIST_COLUMNS.CURRENT_CHANGE, STOCK_LIST_COLUMNS.FAIR_VALUE, STOCK_LIST_COLUMNS.PROFIT_RETURN] },
    { page: STOCK_LIST_PAGES.INSTITUTIONAL, title: '法人佈局密碼', columns: [STOCK_LIST_COLUMNS.START_DAYS, STOCK_LIST_COLUMNS.PE, STOCK_LIST_COLUMNS.ACCUMULATED_BUY, STOCK_LIST_COLUMNS.INSTITUTIONAL_FLOW, STOCK_LIST_COLUMNS.QUADRANT, STOCK_LIST_COLUMNS.PROFIT_RETURN, STOCK_LIST_COLUMNS.SIGNAL] },
    { page: STOCK_LIST_PAGES.RAPID_SCREEN, title: '法人積極買進', columns: [STOCK_LIST_COLUMNS.SECTOR, STOCK_LIST_COLUMNS.ACCUMULATED_BUY, STOCK_LIST_COLUMNS.INSTITUTIONAL_FLOW, STOCK_LIST_COLUMNS.QUADRANT, STOCK_LIST_COLUMNS.BUY_DAYS, STOCK_LIST_COLUMNS.PE, STOCK_LIST_COLUMNS.SIGNAL] },
    { page: STOCK_LIST_PAGES.SECTOR_PE, title: '族群本益比', columns: [STOCK_LIST_COLUMNS.CURRENT_CHANGE, STOCK_LIST_COLUMNS.EPS, STOCK_LIST_COLUMNS.PE, STOCK_LIST_COLUMNS.EVALUATION] },
    { page: STOCK_LIST_PAGES.QUANT, title: '量化精選', columns: [STOCK_LIST_COLUMNS.CURRENT_CHANGE, STOCK_LIST_COLUMNS.SCORE_RETURN, STOCK_LIST_COLUMNS.PE, STOCK_LIST_COLUMNS.FAIR_VALUE, STOCK_LIST_COLUMNS.SIGNAL] },
    { page: STOCK_LIST_PAGES.HOTTEST, title: '今日最熱', columns: [STOCK_LIST_COLUMNS.TOP_RANK, STOCK_LIST_COLUMNS.PE, STOCK_LIST_COLUMNS.CURRENT_CHANGE] },
    { page: STOCK_LIST_PAGES.FAVORITES, title: '我的收藏', columns: [STOCK_LIST_COLUMNS.CURRENT_CHANGE, STOCK_LIST_COLUMNS.PE, STOCK_LIST_COLUMNS.FAIR_VALUE, STOCK_LIST_COLUMNS.PROFIT_RETURN] }
];

const COLUMN_TITLES = {
    [STOCK_LIST_COLUMNS.COST_SHARES]: '成本／股數',
    [STOCK_LIST_COLUMNS.CURRENT_CHANGE]: '現價／漲跌',
    [STOCK_LIST_COLUMNS.FAIR_VALUE]: '公允值',
    [STOCK_LIST_COLUMNS.PROFIT_RETURN]: '盈虧／報酬',
    [STOCK_LIST_COLUMNS.SECTOR]: '產業',
    [STOCK_LIST_COLUMNS.START_DAYS]: '開始／天數',
    [STOCK_LIST_COLUMNS.ACCUMULATED_BUY]: '累計買超',
    [STOCK_LIST_COLUMNS.INSTITUTIONAL_FLOW]: '法人流',
    [STOCK_LIST_COLUMNS.QUADRANT]: '象限',
    [STOCK_LIST_COLUMNS.BUY_DAYS]: '買入天數',
    [STOCK_LIST_COLUMNS.PE]: '本益比',
    [STOCK_LIST_COLUMNS.EPS]: 'EPS',
    [STOCK_LIST_COLUMNS.EVALUATION]: '評價',
    [STOCK_LIST_COLUMNS.SIGNAL]: '訊號',
    [STOCK_LIST_COLUMNS.SCORE_RETURN]: '評分／報酬',
    [STOCK_LIST_COLUMNS.TOP_RANK]: '上榜／領頭羊'
};

const HEADER_TO_COLUMN = [
    [/成本|股數/, STOCK_LIST_COLUMNS.COST_SHARES],
    [/現價|漲跌|股價|最高|最低/, STOCK_LIST_COLUMNS.CURRENT_CHANGE],
    [/公允價|公允值/, STOCK_LIST_COLUMNS.FAIR_VALUE],
    [/盈虧|損益|報酬/, STOCK_LIST_COLUMNS.PROFIT_RETURN],
    [/產業/, STOCK_LIST_COLUMNS.SECTOR],
    [/開始日|天數/, STOCK_LIST_COLUMNS.START_DAYS],
    [/累計買超|日均買超|近3日/, STOCK_LIST_COLUMNS.ACCUMULATED_BUY],
    [/法人流/, STOCK_LIST_COLUMNS.INSTITUTIONAL_FLOW],
    [/象限/, STOCK_LIST_COLUMNS.QUADRANT],
    [/買入/, STOCK_LIST_COLUMNS.BUY_DAYS],
    [/本益比|PE/, STOCK_LIST_COLUMNS.PE],
    [/EPS/, STOCK_LIST_COLUMNS.EPS],
    [/評價/, STOCK_LIST_COLUMNS.EVALUATION],
    [/訊號|操作建議/, STOCK_LIST_COLUMNS.SIGNAL],
    [/備註/, STOCK_LIST_AUXILIARY_COLUMNS.NOTE],
    [/評分|一致性/, STOCK_LIST_COLUMNS.SCORE_RETURN],
    [/Top\s*5|上榜|領頭/, STOCK_LIST_COLUMNS.TOP_RANK]
];

function load() {
    try {
        const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        return raw && typeof raw === 'object' ? raw : {};
    } catch {
        return {};
    }
}

function definition(page) {
    return STOCK_LIST_DEFINITIONS.find(item => item.page === page);
}

export const StockListPreferences = {
    get(page) {
        const def = definition(page);
        const saved = load()[page];
        const values = Array.isArray(saved) ? saved.filter(value => def.columns.includes(value)) : def.columns;
        return values.length ? values : [...def.columns];
    },
    has(page, column) {
        return this.get(page).includes(column);
    },
    set(page, column, enabled) {
        const def = definition(page);
        const data = load();
        const values = this.get(page);
        if (enabled && !values.includes(column)) values.push(column);
        if (!enabled && values.length > 1) values.splice(values.indexOf(column), 1);
        data[page] = def.columns.filter(value => values.includes(value));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        this.applyAll();
        window.dispatchEvent(new CustomEvent('twstock:list-columns-changed', { detail: { page } }));
    },
    reset(page) {
        const data = load();
        delete data[page];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        this.applyAll();
        window.dispatchEvent(new CustomEvent('twstock:list-columns-changed', { detail: { page } }));
    },
    title(column) {
        return COLUMN_TITLES[column] || column;
    },
    applyAll() {
        const roots = [
            ['#portfolio-body', STOCK_LIST_PAGES.PORTFOLIO],
            ['#inst-track-sectors', STOCK_LIST_PAGES.INSTITUTIONAL],
            ['#rapid-screen-list', STOCK_LIST_PAGES.RAPID_SCREEN],
            ['#sector-pe-list', STOCK_LIST_PAGES.SECTOR_PE],
            ['#hottest-container', STOCK_LIST_PAGES.HOTTEST],
            ['#quant-holdings-table', STOCK_LIST_PAGES.QUANT],
            ['#favorites-body', STOCK_LIST_PAGES.FAVORITES]
        ];
        roots.forEach(([selector, page]) => {
            const node = document.querySelector(selector);
            if (!node) return;
            const tables = node.tagName === 'TABLE'
                ? [node]
                : node.closest('table')
                    ? [node.closest('table')]
                    : [...node.querySelectorAll('table')];
            tables.forEach(table => this.applyToTable(table, page));
        });
    },
    applyToTable(table, page) {
        const visible = new Set(this.get(page));
        table.dataset.stockListPage = page;
        const headers = [...table.querySelectorAll('thead th')];
        const columns = headers.map(header => {
            const text = header.textContent.replace(/\s+/g, ' ').trim();
            const match = HEADER_TO_COLUMN.find(([pattern]) => pattern.test(text));
            return match ? match[1] : null;
        });
        headers.forEach((header, index) => {
            const column = columns[index];
            if (!column) return;
            header.dataset.stockColumn = column;
            const hidden = column !== STOCK_LIST_AUXILIARY_COLUMNS.NOTE && !visible.has(column);
            header.classList.toggle('stock-column-hidden', hidden);
            table.querySelectorAll('tbody tr').forEach(row => {
                const cell = row.children[index];
                if (!cell) return;
                cell.dataset.stockColumn = column;
                cell.classList.toggle('stock-column-hidden', hidden);
            });
        });
    }
};

export function stockListColumnSettingsHTML() {
    return STOCK_LIST_DEFINITIONS.map(definitionItem => `
        <details class="stock-list-settings-group rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <summary class="cursor-pointer px-4 py-3 font-bold text-gray-900 dark:text-white">${definitionItem.title}</summary>
            <div class="border-t border-gray-200 dark:border-gray-700 p-3 space-y-1">
                ${definitionItem.columns.map(column => `
                    <label class="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer">
                        <input type="checkbox" data-stock-column-page="${definitionItem.page}" data-stock-column="${column}" class="stock-column-toggle accent-blue-500" ${StockListPreferences.has(definitionItem.page, column) ? 'checked' : ''}>
                        <span class="text-sm text-gray-700 dark:text-gray-300">${StockListPreferences.title(column)}</span>
                    </label>
                `).join('')}
                <button type="button" data-stock-column-reset="${definitionItem.page}" class="text-xs text-blue-500 hover:underline px-2 py-2">恢復目前預設欄位</button>
            </div>
        </details>
    `).join('');
}
