/**
 * TWStock Pro Router
 * 管理主分頁與二級導航
 */

const ROUTES = {
    'market': {
        title: '市場',
        subPages: []
    },
    'portfolio': {
        title: '我的持股',
        subPages: []
    },
    'trendHunter': {
        title: '趨勢獵人',
        subPages: ['法人建倉', '短期快篩', '族群本益比', '量化精選', 'ETF戰情', 'ETF流量', '精選策略', '今日最熱', '資金輪動', '熱力圖']
    },
    'marginRankings': {
        title: '融資排行',
        subPages: []
    },
    'assetRisk': {
        title: '資產風險',
        subPages: ['配置', '風險', '現金流', '績效', '模擬']
    },
    'performance': {
        title: '歷年戰績',
        subPages: []
    },
    'addTrade': {
        title: '新增交易',
        subPages: []
    },
    'favorites': {
        title: '我的收藏',
        subPages: []
    },
    'settings': {
        title: '設定 Settings',
        subPages: []
    },
    'more': {
        title: '更多',
        subPages: []
    },
    'groupSearch': {
        title: '族群搜尋',
        subPages: []
    },
    'audioSummary': {
        title: '財經摘要',
        subPages: []
    }
};

class Router {
    constructor() {
        this.currentPrimary = 'market';
        this.currentSecondary = null;
    }

    init() {
        this.subNavContainer = document.getElementById('sub-nav-container');
        this.viewTitle = document.getElementById('view-title');

        if (!this.viewTitle) {
            console.warn("Router: 'view-title' element not found.");
        }

        // 初始載入第一頁
        try {
            this.switchPage('market');
        } catch (e) {
            console.error("Router: Failed to load initial page", e);
        }
    }

    switchPage(primary, secondary = null) {
        console.log(`Router switching to: ${primary}, ${secondary}`);
        if (!ROUTES[primary]) {
            console.error(`Route not found: ${primary}`);
            return;
        }

        this.currentPrimary = primary;
        const config = ROUTES[primary];

        // 如果沒有指定子分頁，預設選取第一個
        if (!secondary && config.subPages.length > 0) {
            secondary = config.subPages[0];
        }
        this.currentSecondary = secondary;

        // 更新標題
        if (this.viewTitle) {
            this.viewTitle.textContent = config.title;
        }

        // 更新 Sidebar / Mobile Nav UI
        this.updateNavUI(primary);

        // 渲染二級導航
        this.renderSubNav(config.subPages, secondary);

        // 切換視圖內容
        this.toggleViews(primary, secondary);

        // 🚀 v2.19.2: 觸發路由改變事件
        window.dispatchEvent(new CustomEvent('router:changed', {
            detail: { primary, secondary }
        }));
    }

    updateNavUI(primary) {
        // 更新 PC Sidebar
        document.querySelectorAll('.nav-item').forEach(item => {
            const id = item.id.replace('nav-', '');
            // 處理 camelCase 轉 kebab-case 對比
            const normalizedId = id.replace(/[A-Z]/g, m => "-" + m.toLowerCase());
            const normalizedPrimary = primary.replace(/[A-Z]/g, m => "-" + m.toLowerCase());

            if (normalizedId === normalizedPrimary) {
                item.classList.add('active', 'bg-blue-50', 'dark:bg-blue-600/10', 'text-blue-600', 'dark:text-blue-400');
                item.classList.remove('text-gray-600', 'dark:text-gray-400');
            } else {
                item.classList.remove('active', 'bg-blue-50', 'dark:bg-blue-600/10', 'text-blue-600', 'dark:text-blue-400');
                item.classList.add('text-gray-600', 'dark:text-gray-400');
            }
        });

        // 更新 Mobile Bottom Nav
        document.querySelectorAll('[id^="mobile-nav-"]').forEach(item => {
            const id = item.id.replace('mobile-nav-', '');
            if (id === primary) {
                item.classList.add('text-blue-600', 'dark:text-blue-400');
                item.classList.remove('text-gray-500');
            } else {
                item.classList.remove('text-blue-600', 'dark:text-blue-400');
                item.classList.add('text-gray-500');
            }
        });
    }

    renderSubNav(subPages, activeSub) {
        if (!this.subNavContainer) return;

        if (subPages.length === 0) {
            this.subNavContainer.classList.add('hidden');
            this.subNavContainer.innerHTML = '';
            return;
        }

        this.subNavContainer.classList.remove('hidden');
        
        // 根據螢幕寬度選擇渲染樣式 (Tailwind class 處理)
        let html = `
            <div class="grid grid-cols-3 md:grid-cols-5 gap-1 py-2 px-4 md:px-6">
        `;

        subPages.forEach(page => {
            const isActive = page === activeSub;
            html += `
                <button onclick="router.switchPage('${this.currentPrimary}', '${page}')" 
                    class="px-2 py-1.5 md:py-2 text-sm font-medium transition-all duration-200 text-center rounded-lg
                    ${isActive 
                        ? 'text-blue-600 dark:text-blue-400 bg-blue-100/50 dark:bg-blue-600/20' 
                        : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'}"
                >
                    ${page}
                </button>
            `;
        });

        html += '</div>';
        this.subNavContainer.innerHTML = html;
    }

    toggleViews(primary, secondary) {
        const contentArea = document.getElementById('content-area');
        if (!contentArea) return;

        // 隱藏所有視圖
        Array.from(contentArea.children).forEach(child => {
            if (child.id && child.id.startsWith('view-')) {
                child.classList.add('hidden');
            }
        });

        // 顯示當前視圖 (如果沒有對應 ID，則顯示預設內容)
        const viewId = `view-${primary}`;
        let targetView = document.getElementById(viewId);
        
        if (!targetView) {
            // 建立一個開發中的佔位視圖
            targetView = document.createElement('div');
            targetView.id = viewId;
            targetView.className = 'flex flex-col items-center justify-center h-full text-gray-500';
            targetView.innerHTML = `
                <div class="text-4xl mb-4">🛠️</div>
                <div class="text-lg">${ROUTES[primary].title} 模組開發中...</div>
            `;
            contentArea.appendChild(targetView);
        }

        targetView.classList.remove('hidden');

        // 如果有子頁面，可以在這裡進一步分發子頁面的渲染
        if (secondary) {
            console.log(`Switching to sub-page: ${secondary} of ${primary}`);
            // 此處可根據 secondary 切換 targetView 內部的子容器
        }
    }
}

export const router = new Router();
// 暴露到 window 以便 onclick 調用 (簡單做法，或在 app.js 綁定)
window.router = router;
