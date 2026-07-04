/**
 * 財經 AI 摘要模組 (AudioSummary)
 * 
 * 從 ../data/audio_summaries/show_summaries.json 讀取
 * 過去一週的節目 AI 摘要，按節目分組渲染為卡片佈局。
 */

const SHOW_ICONS = {
    'zh_stock': '\uD83C\uDF99\uFE0F',
    'ting_hao': '\uD83D\uDCCA',
    'tech_wav': '\uD83D\uDCBB',
    'old_wang': '\uD83D\uDCC8',
    'money_show': '\uD83D\uDCB9',
};

export class AudioSummary {
    constructor() {
        this.data = null;
        this.container = document.getElementById('audio-summary-content');
    }

    async init() {
        if (!this.container) return;
        await this.fetchData();
        this.render();
    }

    async fetchData() {
        const url = '../data/audio_summaries/show_summaries.json';
        try {
            const resp = await fetch(url + '?t=' + Date.now());
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            this.data = await resp.json();
        } catch (e) {
            console.error('AudioSummary: 讀取失敗', e);
            this.container.innerHTML =
                '<div class="flex flex-col items-center justify-center py-20 text-gray-500">' +
                '<span class="text-4xl mb-4">\uD83D\uDCE1</span>' +
                '<p class="text-lg">暫無節目摘要資料</p>' +
                '<p class="text-sm text-gray-400 mt-2">等待 GitHub Actions 首次排程執行</p>' +
                '</div>';
        }
    }

    render() {
        if (!this.data || !this.data.episodes || this.data.episodes.length === 0) {
            return;
        }

        // 依 show_key 分組
        const groups = {};
        for (const ep of this.data.episodes) {
            const key = ep.show_key;
            if (!groups[key]) groups[key] = { config: null, episodes: [] };
            groups[key].episodes.push(ep);
        }

        for (const key of Object.keys(groups)) {
            const first = groups[key].episodes[0];
            const icon = SHOW_ICONS[key] || '\uD83C\uDFA7';
            const colors = {
                'zh_stock': 'from-blue-500 to-blue-600',
                'ting_hao': 'from-emerald-500 to-emerald-600',
                'tech_wav': 'from-purple-500 to-purple-600',
                'old_wang': 'from-orange-500 to-orange-600',
                'money_show': 'from-rose-500 to-rose-600',
            };
            groups[key].config = {
                show_name: first.show_name,
                category: first.category,
                icon: icon,
                color: colors[key] || 'from-gray-500 to-gray-600',
            };
        }

        // 排序
        const order = ['zh_stock', 'ting_hao', 'tech_wav', 'old_wang', 'money_show'];
        const sortedKeys = Object.keys(groups).sort(
            (a, b) => order.indexOf(a) - order.indexOf(b)
        );

        const lastUpdated = this.data.last_updated
            ? new Date(this.data.last_updated).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })
            : '--';

        let html =
            '<div class="space-y-6">' +
            '<div class="flex items-center justify-between">' +
            '<div class="flex items-center space-x-2">' +
            '<span class="text-2xl">\uD83D\uDCE1</span>' +
            '<h3 class="text-lg font-bold text-gray-900 dark:text-white">財經 AI 摘要</h3>' +
            '</div>' +
            '<span class="text-[10px] text-gray-500 font-mono bg-gray-100 dark:bg-gray-800/50 px-3 py-1 rounded-full border border-gray-200 dark:border-gray-700">' +
            '更新: ' + lastUpdated +
            '</span>' +
            '</div>' +
            '<p class="text-xs text-gray-400">過去一週內共 ' + this.data.episodes.length + ' 集節目摘要</p>';

        for (const key of sortedKeys) {
            const group = groups[key];
            const cfg = group.config;
            const episodes = group.episodes.sort(
                (a, b) => (b.publish_date || '').localeCompare(a.publish_date || '')
            );

            html +=
                '<div class="bg-white dark:bg-[#161b22] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden transition-colors duration-300">' +
                '<div class="bg-gradient-to-r ' + cfg.color + ' px-5 py-3">' +
                '<div class="flex items-center justify-between">' +
                '<div class="flex items-center space-x-2">' +
                '<span class="text-xl">' + cfg.icon + '</span>' +
                '<h4 class="font-bold text-white">' + cfg.show_name + '</h4>' +
                '<span class="text-xs text-white/70 bg-white/20 px-2 py-0.5 rounded-full">' + cfg.category + '</span>' +
                '</div>' +
                '<span class="text-xs text-white/60">' + episodes.length + ' 集</span>' +
                '</div>' +
                '</div>' +
                '<div class="divide-y divide-gray-100 dark:divide-gray-800">';

            for (const ep of episodes) {
                html += this.renderEpisode(ep);
            }

            html += '</div></div>';
        }

        html += '</div>';
        this.container.innerHTML = html;

        // 綁定展開/收合事件
        const toggles = this.container.querySelectorAll('.episode-toggle');
        for (let i = 0; i < toggles.length; i++) {
            toggles[i].addEventListener('click', function () {
                const body = this.nextElementSibling;
                const isHidden = body.classList.contains('hidden');
                body.classList.toggle('hidden');
                const icon = this.querySelector('.toggle-icon');
                if (icon) icon.textContent = isHidden ? '\u25BC' : '\u25B6';
            });
        }
    }

    renderEpisode(ep) {
        const pubDate = ep.publish_date || '--';
        const summary = ep.ai_summary || {};
        const targets = summary.core_targets || [];
        const keyData = summary.key_data || [];
        const bullish = summary.bullish_points || [];
        const bearish = summary.bearish_points || [];
        const advice = summary.trading_advice || '';

        let html =
            '<div class="episode-card">' +
            '<div class="episode-toggle flex items-start justify-between gap-3 px-5 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors select-none">' +
            '<div class="flex items-start gap-3 min-w-0 flex-1">' +
            '<span class="toggle-icon text-gray-400 text-xs transition-transform pt-1">\u25B6</span>' +
            '<div class="min-w-0 flex-1 space-y-1.5">' +
            '<span class="inline-block text-xs text-gray-500 font-mono bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">' + pubDate + '</span>' +
            '<p class="text-sm font-medium leading-relaxed text-gray-900 dark:text-white break-words whitespace-normal">' + this.escapeHtml(ep.title) + '</p>' +
            '</div>' +
            '</div>' +
            '<div class="flex items-center space-x-2 shrink-0 pt-1">' +
            '<a href="' + ep.source_url + '" target="_blank" rel="noopener noreferrer"' +
            ' class="text-xs text-blue-500 hover:text-blue-600 hover:underline"' +
            ' onclick="event.stopPropagation()">' +
            '\uD83D\uDD17 來源</a>' +
            '</div>' +
            '</div>' +
            '<div class="hidden px-5 pb-4 space-y-3">';

        if (targets.length > 0) {
            html += '<div class="flex flex-wrap gap-1.5">';
            for (const t of targets) {
                html += '<span class="inline-block bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-medium px-2.5 py-1 rounded-full">' + this.escapeHtml(t) + '</span>';
            }
            html += '</div>';
        }

        if (keyData.length > 0) {
            html += '<div class="flex flex-wrap gap-2 text-xs text-gray-600 dark:text-gray-400">';
            for (const k of keyData) {
                html += '<span class="bg-gray-50 dark:bg-gray-800/50 px-2.5 py-1 rounded-lg border border-gray-100 dark:border-gray-700">\uD83D\uDCCA ' + this.escapeHtml(k) + '</span>';
            }
            html += '</div>';
        }

        html += '<div class="space-y-3 text-xs">';

        if (bullish.length > 0) {
            html += '<div class="bg-red-50/50 dark:bg-red-900/10 border border-red-200/50 dark:border-red-800/30 rounded-xl p-3">' +
                '<p class="font-bold text-red-600 dark:text-red-400 mb-2 text-[11px] uppercase tracking-wider">\uD83D\uDCC8 看多</p><ul class="list-disc list-outside pl-4 space-y-1.5">';
            for (const b of bullish) {
                html += '<li class="text-gray-700 dark:text-gray-300 leading-relaxed break-words">' + this.escapeHtml(b) + '</li>';
            }
            html += '</ul></div>';
        }

        if (bearish.length > 0) {
            html += '<div class="bg-green-50/50 dark:bg-green-900/10 border border-green-200/50 dark:border-green-800/30 rounded-xl p-3">' +
                '<p class="font-bold text-green-600 dark:text-green-400 mb-2 text-[11px] uppercase tracking-wider">\uD83D\uDCC9 看空</p><ul class="list-disc list-outside pl-4 space-y-1.5">';
            for (const b of bearish) {
                html += '<li class="text-gray-700 dark:text-gray-300 leading-relaxed break-words">' + this.escapeHtml(b) + '</li>';
            }
            html += '</ul></div>';
        }

        html += '</div>';

        if (advice) {
            html += '<div class="bg-amber-50/50 dark:bg-amber-900/10 border border-amber-200/50 dark:border-amber-800/30 rounded-xl p-3">' +
                '<p class="font-bold text-amber-600 dark:text-amber-400 mb-1 text-[11px] uppercase tracking-wider">\uD83D\uDCA1 操作建議</p>' +
                '<p class="text-sm text-gray-800 dark:text-gray-200 font-medium">' + this.escapeHtml(advice) + '</p>' +
                '</div>';
        }

        html += '</div></div>';
        return html;
    }

    escapeHtml(str) {
        if (!str) return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
}
